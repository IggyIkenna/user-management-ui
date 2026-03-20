import express from "express";
import cors from "cors";
import { GoogleAuth } from "google-auth-library";
import admin from "firebase-admin";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import {
  runProviderDeprovisioning,
  runProviderHealthChecks,
  runProviderProvisioning,
} from "./providers.js";
import { loadProviderSecrets } from "./secret-manager.js";

const PORT = Number(process.env.PORT || 8017);
const FIREBASE_PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT_ID || "central-element-323112";
const GCP_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

const WORKFLOW_NAMES = {
  onboard: process.env.GOOGLE_WORKFLOW_ONBOARD || "um-onboard-user",
  modify: process.env.GOOGLE_WORKFLOW_MODIFY || "um-modify-user",
  offboard: process.env.GOOGLE_WORKFLOW_OFFBOARD || "um-offboard-user",
  reprovision: process.env.GOOGLE_WORKFLOW_REPROVISION || "um-reprovision-user",
  quota: process.env.GOOGLE_WORKFLOW_QUOTA || "um-quota-check",
};

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: FIREBASE_PROJECT_ID,
  });
}

const auth = admin.auth();
const firestore = admin.firestore();
const googleAuth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function usersCollection() {
  return firestore.collection("user_profiles");
}

function templatesCollection() {
  return firestore.collection("access_templates");
}

function workflowsCollection() {
  return firestore.collection("workflow_runs");
}

function healthChecksCollection() {
  return firestore.collection("health_check_runs");
}

function validateAccessTemplatePayload(payload, isPartial = false) {
  const errors = [];
  const has = (key) => Object.prototype.hasOwnProperty.call(payload || {}, key);
  if (!isPartial || has("name")) {
    if (!payload?.name || !String(payload.name).trim()) {
      errors.push("name is required.");
    }
  }
  if (has("slack_channels")) {
    if (!Array.isArray(payload.slack_channels)) {
      errors.push("slack_channels must be an array.");
    } else {
      for (const channel of payload.slack_channels) {
        if (!/^[CGD][A-Z0-9]{8,}$/.test(String(channel))) {
          errors.push(`Invalid Slack channel ID: ${channel}`);
        }
      }
    }
  }
  if (has("github_teams")) {
    if (!Array.isArray(payload.github_teams)) {
      errors.push("github_teams must be an array.");
    } else {
      for (const slug of payload.github_teams) {
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(String(slug))) {
          errors.push(`Invalid GitHub team slug: ${slug}`);
        }
      }
    }
  }
  if (has("aws_permission_sets")) {
    if (!Array.isArray(payload.aws_permission_sets)) {
      errors.push("aws_permission_sets must be an array.");
    } else {
      for (const setName of payload.aws_permission_sets) {
        if (!/^[A-Za-z0-9:_./-]+$/.test(String(setName))) {
          errors.push(`Invalid AWS permission set value: ${setName}`);
        }
      }
    }
  }
  return errors;
}

async function resolveUserUid(inputId) {
  const direct = await usersCollection().doc(inputId).get();
  if (direct.exists) return inputId;
  const query = await usersCollection().where("id", "==", inputId).limit(1).get();
  if (!query.empty) return query.docs[0].id;
  return inputId;
}

async function getAccessTemplateById(templateId) {
  if (!templateId) return null;
  const doc = await templatesCollection().doc(templateId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function listTemplateAssignmentCounts() {
  const snapshot = await usersCollection().get();
  const counts = {};
  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const templateId = data.access_template_id;
    if (!templateId) continue;
    counts[templateId] = (counts[templateId] || 0) + 1;
  }
  return counts;
}

async function startWorkflowExecution(workflowName, argument) {
  const workflowExecutionEnabled = parseBool("WORKFLOW_EXECUTION_ENABLED", true);
  if (!workflowExecutionEnabled) {
    return {
      name: `disabled/${workflowName}/${Date.now()}`,
      state: "DISABLED",
      argument: JSON.stringify(argument),
    };
  }
  const client = await googleAuth.getClient();
  const url = `https://workflowexecutions.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/locations/${GCP_LOCATION}/workflows/${workflowName}/executions`;
  const payload = { argument: JSON.stringify(argument) };
  const res = await client.request({
    url,
    method: "POST",
    data: payload,
  });
  return res.data;
}

async function safeStartWorkflowExecution(workflowName, argument) {
  try {
    return await startWorkflowExecution(workflowName, argument);
  } catch (error) {
    return {
      name: `failed/${workflowName}/${Date.now()}`,
      state: "FAILED_TO_START",
      error: String(error),
      argument: JSON.stringify(argument),
    };
  }
}

async function getWorkflowExecution(executionName) {
  if (executionName.startsWith("disabled/")) {
    return { name: executionName, state: "DISABLED" };
  }
  if (executionName.startsWith("failed/")) {
    return { name: executionName, state: "FAILED_TO_START" };
  }
  const client = await googleAuth.getClient();
  const encoded = executionName
    .replace("https://workflowexecutions.googleapis.com/v1/", "")
    .replace(/^\//, "");
  const url = `https://workflowexecutions.googleapis.com/v1/${encoded}`;
  const res = await client.request({ url, method: "GET" });
  return res.data;
}

async function updateWorkflowRunStatus(executionName, execution) {
  const snapshot = await workflowsCollection()
    .where("execution_name", "==", executionName)
    .orderBy("created_at", "desc")
    .limit(1)
    .get();
  if (snapshot.empty) return;
  const doc = snapshot.docs[0];
  const firebaseUid = doc.data()?.firebase_uid;
  await doc.ref.set(
    {
      status: execution.state || "UNKNOWN",
      execution_result: execution.result || null,
      execution_error: execution.error || null,
      end_time: execution.endTime || null,
      updated_at: new Date().toISOString(),
    },
    { merge: true },
  );
  if (firebaseUid && (execution.state === "FAILED" || execution.state === "FAILED_TO_START")) {
    await usersCollection().doc(firebaseUid).set(
      {
        workflow_failure_reason: execution.error || execution.result || "workflow failed",
        last_modified: new Date().toISOString(),
      },
      { merge: true },
    );
  }
}

async function logWorkflowRun(run) {
  const now = new Date().toISOString();
  await workflowsCollection().add({
    ...run,
    created_at: now,
    updated_at: now,
  });
}

async function listUserWorkflowRuns(firebaseUid) {
  const snapshot = await workflowsCollection()
    .where("firebase_uid", "==", firebaseUid)
    .orderBy("created_at", "desc")
    .limit(20)
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function listUsersWithProfiles() {
  const [authUsers, profileSnapshot] = await Promise.all([
    auth.listUsers(1000),
    usersCollection().get(),
  ]);
  const profileMap = new Map();
  for (const doc of profileSnapshot.docs) {
    profileMap.set(doc.id, doc.data());
  }

  return authUsers.users.map((u) => {
    const profile = profileMap.get(u.uid) || {};
    const role = profile.role || u.customClaims?.role || "client";
    const status = u.disabled ? "offboarded" : "active";
    const serviceStatus = status === "offboarded" ? "not_applicable" : "provisioned";
    return {
      id: profile.id || u.uid,
      firebase_uid: u.uid,
      name: u.displayName || profile.name || u.email || u.uid,
      email: u.email || profile.email || "",
      role,
      github_handle: profile.github_handle,
      microsoft_upn: profile.microsoft_upn,
      slack_handle: profile.slack_handle,
      gcp_email: profile.gcp_email,
      product_slugs: profile.product_slugs || [],
      access_template_id: profile.access_template_id || null,
      access_template: profile.access_template || null,
      service_messages: profile.service_messages || {},
      workflow_failure_reason: profile.workflow_failure_reason || null,
      status,
      provisioned_at: profile.provisioned_at || u.metadata.creationTime,
      last_modified: profile.last_modified || u.metadata.lastRefreshTime,
      services: {
        github: profile.services?.github || serviceStatus,
        slack: profile.services?.slack || serviceStatus,
        microsoft365: profile.services?.microsoft365 || serviceStatus,
        gcp: profile.services?.gcp || serviceStatus,
        aws: profile.services?.aws || serviceStatus,
        portal: profile.services?.portal || serviceStatus,
      },
    };
  });
}

function parseBool(envName, fallback) {
  const raw = process.env[envName];
  if (raw === undefined) return fallback;
  return String(raw).toLowerCase() === "true";
}

function quotaFromEnv() {
  const slackLimit = Number(process.env.SLACK_SEAT_LIMIT || 0);
  const m365Limit = Number(process.env.M365_LICENSE_LIMIT || 0);
  return {
    slackLimit,
    m365Limit,
  };
}

function roleNeedsSlack(role) {
  return role !== "shareholder";
}

function roleNeedsM365(role) {
  const collaboratorM365Enabled =
    String(process.env.COLLABORATOR_M365_ENABLED || "true") === "true";
  return (
    role === "admin" ||
    role === "accounting" ||
    role === "operations" ||
    (collaboratorM365Enabled && role === "collaborator")
  );
}

async function computeQuotaCheck(role) {
  const users = await listUsersWithProfiles();
  const active = users.filter((u) => u.status === "active");
  const slackUsed = active.filter((u) => u.services.slack === "provisioned").length;
  const m365Used = active.filter(
    (u) => u.services.microsoft365 === "provisioned",
  ).length;
  const { slackLimit, m365Limit } = quotaFromEnv();
  const checks = [
    {
      service: "slack",
      used: slackUsed,
      limit: slackLimit,
      available: Math.max(slackLimit - slackUsed, 0),
    },
    {
      service: "microsoft365",
      used: m365Used,
      limit: m365Limit,
      available: Math.max(m365Limit - m365Used, 0),
    },
  ];
  const slackOk = !roleNeedsSlack(role) || slackLimit === 0 || checks[0].available > 0;
  const m365Ok = !roleNeedsM365(role) || m365Limit === 0 || checks[1].available > 0;
  return {
    ok: slackOk && m365Ok,
    checks,
    message:
      slackOk && m365Ok
        ? undefined
        : "Provisioning blocked: required service quota is exhausted.",
  };
}

app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    firebase_project: FIREBASE_PROJECT_ID,
    mode: "real",
  });
});

app.get("/api/v1/users", async (_req, res) => {
  try {
    const users = await listUsersWithProfiles();
    res.json({ users, total: users.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/users/:id", async (req, res) => {
  try {
    const users = await listUsersWithProfiles();
    const user = users.find((u) => u.id === req.params.id || u.firebase_uid === req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/users/:id/workflows", async (req, res) => {
  try {
    const firebaseUid = await resolveUserUid(req.params.id);
    const runs = await listUserWorkflowRuns(firebaseUid);
    res.json({ runs, total: runs.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/workflows/execution", async (req, res) => {
  try {
    const name = String(req.query.name || "");
    if (!name) {
      return res.status(400).json({ error: "Execution name is required." });
    }
    const execution = await getWorkflowExecution(name);
    await updateWorkflowRunStatus(name, execution);
    res.json({ execution });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/admin/health-checks", async (_req, res) => {
  try {
    const checks = await runProviderHealthChecks();
    const secrets = await loadProviderSecrets();
    const workflowExecutionEnabled = parseBool("WORKFLOW_EXECUTION_ENABLED", true);

    // Firebase connectivity check
    try {
      await auth.listUsers(1);
      checks.push({
        provider: "firebase",
        ok: true,
        message: "Firebase Auth reachable.",
        checked_at: new Date().toISOString(),
      });
    } catch (error) {
      checks.push({
        provider: "firebase",
        ok: false,
        message: String(error),
        checked_at: new Date().toISOString(),
      });
    }

    // AWS STS reachability
    try {
      if (secrets.awsAccessKeyId && secrets.awsSecretAccessKey) {
        const stsClient = new STSClient({
          region: process.env.AWS_REGION || "us-east-1",
          credentials: {
            accessKeyId: secrets.awsAccessKeyId,
            secretAccessKey: secrets.awsSecretAccessKey,
            sessionToken: secrets.awsSessionToken || undefined,
          },
        });
        const identity = await stsClient.send(new GetCallerIdentityCommand({}));
        checks.push({
          provider: "aws-sts",
          ok: true,
          message: "AWS STS reachable.",
          details: identity,
          checked_at: new Date().toISOString(),
        });
      } else {
        checks.push({
          provider: "aws-sts",
          ok: false,
          message: "AWS credentials missing for STS test.",
          checked_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      checks.push({
        provider: "aws-sts",
        ok: false,
        message: String(error),
        checked_at: new Date().toISOString(),
      });
    }

    // Workflow API reachability
    try {
      if (!workflowExecutionEnabled) {
        checks.push({
          provider: "google-workflows",
          ok: true,
          message: "Workflow execution disabled by config.",
          checked_at: new Date().toISOString(),
        });
      } else {
        const client = await googleAuth.getClient();
        const url = `https://workflowexecutions.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/locations/${GCP_LOCATION}/workflows`;
        const workflowRes = await client.request({ url, method: "GET" });
        checks.push({
          provider: "google-workflows",
          ok: true,
          message: "Workflow API reachable.",
          details: { total: workflowRes.data?.workflows?.length || 0 },
          checked_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      checks.push({
        provider: "google-workflows",
        ok: false,
        message: String(error),
        checked_at: new Date().toISOString(),
      });
    }

    const ok = checks.every((c) => c.ok);
    const checkedAt = new Date().toISOString();
    await healthChecksCollection().add({
      ok,
      checked_at: checkedAt,
      checks,
      created_at: checkedAt,
      updated_at: checkedAt,
    });
    res.json({
      ok,
      checked_at: checkedAt,
      checks,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/admin/health-checks/history", async (_req, res) => {
  try {
    const snapshot = await healthChecksCollection()
      .orderBy("checked_at", "desc")
      .limit(20)
      .get();
    const runs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ runs, total: runs.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/firebase-auth/users", async (_req, res) => {
  try {
    const listed = await auth.listUsers(1000);
    const users = listed.users.map((u) => ({
      uid: u.uid,
      email: u.email,
      display_name: u.displayName || "",
      disabled: u.disabled,
      custom_claims: u.customClaims || {},
    }));
    res.json({ users, total: users.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/users/quota-check", async (req, res) => {
  try {
    const role = req.body?.role || "client";
    const result = await computeQuotaCheck(role);
    res.json({ quota: result });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/access-templates", async (_req, res) => {
  try {
    const assignmentCounts = await listTemplateAssignmentCounts();
    const snapshot = await templatesCollection().orderBy("updated_at", "desc").get();
    const templates = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      assigned_user_count: assignmentCounts[doc.id] || 0,
    }));
    res.json({ templates, total: templates.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/access-templates", async (req, res) => {
  try {
    const payload = req.body || {};
    const errors = validateAccessTemplatePayload(payload, false);
    if (errors.length > 0) {
      return res.status(400).json({ error: "Validation failed.", details: errors });
    }
    const now = new Date().toISOString();
    const docRef = await templatesCollection().add({
      name: payload.name.trim(),
      description: payload.description || "",
      aws_permission_sets: payload.aws_permission_sets || [],
      slack_channels: payload.slack_channels || [],
      github_teams: payload.github_teams || [],
      created_at: now,
      updated_at: now,
    });
    const created = await docRef.get();
    res.status(201).json({ template: { id: created.id, ...created.data() } });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.put("/api/v1/access-templates/:id", async (req, res) => {
  try {
    const payload = req.body || {};
    const errors = validateAccessTemplatePayload(payload, true);
    if (errors.length > 0) {
      return res.status(400).json({ error: "Validation failed.", details: errors });
    }
    const id = req.params.id;
    const ref = templatesCollection().doc(id);
    const existing = await ref.get();
    if (!existing.exists) {
      return res.status(404).json({ error: "Template not found." });
    }
    await ref.set(
      {
        ...payload,
        updated_at: new Date().toISOString(),
      },
      { merge: true },
    );
    const updated = await ref.get();
    const mergedTemplate = { id: updated.id, ...updated.data() };
    const usersSnapshot = await usersCollection()
      .where("access_template_id", "==", id)
      .get();
    const batch = firestore.batch();
    for (const userDoc of usersSnapshot.docs) {
      batch.set(
        userDoc.ref,
        {
          access_template: mergedTemplate,
          last_modified: new Date().toISOString(),
        },
        { merge: true },
      );
    }
    if (!usersSnapshot.empty) {
      await batch.commit();
    }
    res.json({ template: mergedTemplate });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete("/api/v1/access-templates/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const ref = templatesCollection().doc(id);
    const existing = await ref.get();
    if (!existing.exists) {
      return res.status(404).json({ error: "Template not found." });
    }
    const usersSnapshot = await usersCollection()
      .where("access_template_id", "==", id)
      .limit(1)
      .get();
    if (!usersSnapshot.empty) {
      return res.status(409).json({
        error: "Template is in use by one or more users and cannot be deleted.",
      });
    }
    await ref.delete();
    res.json({ deleted: true, id });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/users/onboard", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.email || !payload.name || !payload.role) {
      return res.status(400).json({ error: "name, email, and role are required." });
    }

    const quota = await computeQuotaCheck(payload.role);
    if (!quota.ok) {
      return res.status(409).json({ error: quota.message, quota, code: "QUOTA_EXCEEDED" });
    }

    const firebaseUser = await auth.createUser({
      email: payload.email,
      displayName: payload.name,
      disabled: false,
    });

    await auth.setCustomUserClaims(firebaseUser.uid, {
      role: payload.role,
      source: "user-management-ui",
    });

    const now = new Date().toISOString();
    const accessTemplate = await getAccessTemplateById(payload.access_template_id);
    const profile = {
      id: payload.id || firebaseUser.uid,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      github_handle: payload.github_handle || null,
      product_slugs: payload.product_slugs || [],
      status: "active",
      provisioned_at: now,
      last_modified: now,
      access_template_id: payload.access_template_id || null,
      access_template: accessTemplate,
      services: {
        github: "pending",
        slack: "pending",
        microsoft365: "pending",
        gcp: "pending",
        aws: "pending",
        portal: "pending",
      },
    };
    await usersCollection().doc(firebaseUser.uid).set(profile);

    const workflowInput = {
      firebase_uid: firebaseUser.uid,
      profile,
      source_project: FIREBASE_PROJECT_ID,
      access_template: accessTemplate,
    };
    const execution = await safeStartWorkflowExecution(
      WORKFLOW_NAMES.onboard,
      workflowInput,
    );
    await logWorkflowRun({
      firebase_uid: firebaseUser.uid,
      run_type: "onboard",
      workflow_name: WORKFLOW_NAMES.onboard,
      execution_name: execution.name,
      status: execution.state || "ACTIVE",
      input: workflowInput,
    });

    const realProviderExecutionEnabled = parseBool(
      "REAL_PROVIDER_EXECUTION_ENABLED",
      true,
    );
    const provisioningSteps = [
      { service: "firebase", label: "Firebase Auth", status: "success" },
    ];
    if (realProviderExecutionEnabled) {
      const providerSteps = await runProviderProvisioning({
        ...profile,
        firebase_uid: firebaseUser.uid,
      });
      provisioningSteps.push(...providerSteps);
      const servicePatch = {};
      const serviceMessages = {};
      let workflowFailureReason = null;
      for (const step of providerSteps) {
        if (step.service in profile.services) {
          if (step.status !== "success") {
            servicePatch[step.service] = "failed";
            serviceMessages[step.service] = step.message || "Provider execution failed.";
            if (!workflowFailureReason) {
              workflowFailureReason = `${step.label}: ${step.message || "failed"}`;
            }
          } else if (String(step.message || "").includes("not applicable")) {
            servicePatch[step.service] = "not_applicable";
            serviceMessages[step.service] = step.message || "not applicable";
          } else {
            servicePatch[step.service] = "provisioned";
            serviceMessages[step.service] = step.message || "ok";
          }
        }
      }
      await usersCollection().doc(firebaseUser.uid).set(
        {
          services: {
            ...profile.services,
            ...servicePatch,
          },
          service_messages: serviceMessages,
          workflow_failure_reason: workflowFailureReason,
          last_modified: new Date().toISOString(),
        },
        { merge: true },
      );
    }

    res.status(201).json({
      user: { ...profile, firebase_uid: firebaseUser.uid },
      provisioning_steps: provisioningSteps,
      workflow_execution: execution.name,
      quota,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.put("/api/v1/users/:id", async (req, res) => {
  try {
    const id = await resolveUserUid(req.params.id);
    const payload = req.body || {};
    const profileRef = usersCollection().doc(id);
    const existing = await profileRef.get();
    if (!existing.exists) {
      return res.status(404).json({ error: "User profile not found." });
    }
    const prev = existing.data();
    const next = {
      ...prev,
      ...payload,
      last_modified: new Date().toISOString(),
    };
    if (payload.access_template_id !== undefined) {
      next.access_template = await getAccessTemplateById(payload.access_template_id);
    }
    await profileRef.set(next, { merge: true });
    if (payload.role) {
      await auth.setCustomUserClaims(id, {
        ...(await auth.getUser(id)).customClaims,
        role: payload.role,
      });
    }

    const execution = await safeStartWorkflowExecution(WORKFLOW_NAMES.modify, {
      firebase_uid: id,
      updates: payload,
      access_template: next.access_template || null,
      source_project: FIREBASE_PROJECT_ID,
    });
    await logWorkflowRun({
      firebase_uid: id,
      run_type: "modify",
      workflow_name: WORKFLOW_NAMES.modify,
      execution_name: execution.name,
      status: execution.state || "ACTIVE",
      input: payload,
    });

    res.json({
      user: { ...next, firebase_uid: id },
      workflow_execution: execution.name,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/users/:id/offboard", async (req, res) => {
  try {
    const id = await resolveUserUid(req.params.id);
    const payload = req.body || {};
    const actions = payload.actions || {};
    const profileSnapshot = await usersCollection().doc(id).get();
    const profile = profileSnapshot.data() || {};
    const defaultDeactivate = parseBool("OFFBOARD_DEFAULT_DEACTIVATE", true);
    const doDelete =
      actions.firebase === "delete" || (!defaultDeactivate && actions.firebase !== "deactivate");

    if (doDelete) {
      await auth.deleteUser(id);
    } else {
      await auth.updateUser(id, { disabled: true });
    }

    await usersCollection().doc(id).set(
      {
        status: "offboarded",
        last_modified: new Date().toISOString(),
      },
      { merge: true },
    );

    const execution = await safeStartWorkflowExecution(WORKFLOW_NAMES.offboard, {
      firebase_uid: id,
      actions,
      source_project: FIREBASE_PROJECT_ID,
    });
    await logWorkflowRun({
      firebase_uid: id,
      run_type: "offboard",
      workflow_name: WORKFLOW_NAMES.offboard,
      execution_name: execution.name,
      status: execution.state || "ACTIVE",
      input: actions,
    });

    const realProviderExecutionEnabled = parseBool(
      "REAL_PROVIDER_EXECUTION_ENABLED",
      true,
    );
    let revocationSteps = [
      {
        service: "firebase",
        label: `Firebase (${doDelete ? "delete" : "deactivate"})`,
        status: "success",
      },
    ];
    if (realProviderExecutionEnabled) {
      const providerSteps = await runProviderDeprovisioning({
        ...profile,
        firebase_uid: id,
      });
      revocationSteps = [...revocationSteps, ...providerSteps];
      await usersCollection().doc(id).set(
        {
          services: {
            github: "not_applicable",
            slack: "not_applicable",
            microsoft365: "not_applicable",
            gcp: "not_applicable",
            aws: "not_applicable",
            portal: "not_applicable",
          },
          service_messages: {
            github: "offboarded",
            slack: "offboarded",
            microsoft365: "offboarded",
            gcp: "offboarded",
            aws: "offboarded",
            portal: "offboarded",
          },
          workflow_failure_reason: null,
        },
        { merge: true },
      );
    }

    const userSnapshot = await usersCollection().doc(id).get();
    res.json({
      user: {
        firebase_uid: id,
        ...(userSnapshot.data() || {}),
      },
      revocation_steps: revocationSteps,
      workflow_execution: execution.name,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/users/:id/reprovision", async (req, res) => {
  try {
    const id = await resolveUserUid(req.params.id);
    const profileRef = usersCollection().doc(id);
    const snapshot = await profileRef.get();
    if (!snapshot.exists) {
      return res.status(404).json({ error: "User profile not found." });
    }
    const profile = snapshot.data();
    const execution = await safeStartWorkflowExecution(WORKFLOW_NAMES.reprovision, {
      firebase_uid: id,
      profile,
      access_template: profile?.access_template || null,
      source_project: FIREBASE_PROJECT_ID,
    });
    await logWorkflowRun({
      firebase_uid: id,
      run_type: "reprovision",
      workflow_name: WORKFLOW_NAMES.reprovision,
      execution_name: execution.name,
      status: execution.state || "ACTIVE",
      input: profile,
    });
    const realProviderExecutionEnabled = parseBool(
      "REAL_PROVIDER_EXECUTION_ENABLED",
      true,
    );
    let provisioning_steps = [];
    if (realProviderExecutionEnabled) {
      const providerSteps = await runProviderProvisioning({
        ...profile,
        firebase_uid: id,
      });
      provisioning_steps = providerSteps;
      const servicePatch = {};
      const serviceMessages = {};
      let workflowFailureReason = null;
      for (const step of providerSteps) {
        if (step.service in (profile?.services || {})) {
          if (step.status !== "success") {
            servicePatch[step.service] = "failed";
            serviceMessages[step.service] = step.message || "Provider execution failed.";
            if (!workflowFailureReason) {
              workflowFailureReason = `${step.label}: ${step.message || "failed"}`;
            }
          } else if (String(step.message || "").includes("not applicable")) {
            servicePatch[step.service] = "not_applicable";
            serviceMessages[step.service] = step.message || "not applicable";
          } else {
            servicePatch[step.service] = "provisioned";
            serviceMessages[step.service] = step.message || "ok";
          }
        }
      }
      await profileRef.set(
        {
          services: {
            ...(profile?.services || {}),
            ...servicePatch,
          },
          service_messages: serviceMessages,
          workflow_failure_reason: workflowFailureReason,
        },
        { merge: true },
      );
    }
    await profileRef.set(
      {
        last_modified: new Date().toISOString(),
      },
      { merge: true },
    );
    res.json({ workflow_execution: execution.name, provisioning_steps });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`real user-management API listening on :${PORT}`);
});
