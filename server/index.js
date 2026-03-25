import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import cors from "cors";
import { GoogleAuth } from "google-auth-library";
import admin from "firebase-admin";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

for (const envFile of [".env.development", ".env.local", ".env"]) {
  try {
    const contents = readFileSync(resolve(envFile), "utf8");
    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* file not found is fine */
  }
}
import {
  runProviderDeprovisioning,
  runProviderHealthChecks,
  runProviderProvisioning,
} from "./providers.js";
import {
  loadProviderSecrets,
  resolveFirebaseApiKey,
} from "./secret-manager.js";

const PORT = Number(process.env.PORT || 8017);
const FIREBASE_PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT_ID || "central-element-323112";
const FIREBASE_STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || `${FIREBASE_PROJECT_ID}.appspot.com`;
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
    storageBucket: FIREBASE_STORAGE_BUCKET,
  });
}

const auth = admin.auth();
const firestore = admin.firestore();
const storageBucket = admin.storage().bucket();
const googleAuth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

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

function applicationsCollection() {
  return firestore.collection("applications");
}

function appSyncHistoryCollection() {
  return firestore.collection("app_sync_history");
}

function appEntitlementsCollection() {
  return firestore.collection("app_entitlements");
}

function groupsCollection() {
  return firestore.collection("user_groups");
}

function auditLogCollection() {
  return firestore.collection("audit_log");
}

function appCapabilitiesCollection() {
  return firestore.collection("app_capabilities");
}

function onboardingRequestsCollection() {
  return firestore.collection("onboarding_requests");
}

function userDocumentsCollection() {
  return firestore.collection("user_documents");
}

function notificationPreferencesCollection() {
  return firestore.collection("notification_preferences");
}

function sanitizeFileName(fileName) {
  return String(fileName || "document.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function createUserDocumentRecord(uid, payload, actor = "user") {
  const now = new Date().toISOString();
  const docRef = await userDocumentsCollection().add({
    firebase_uid: uid,
    onboarding_request_id: payload.onboarding_request_id || null,
    doc_type: payload.doc_type,
    file_name: payload.file_name,
    storage_path: payload.storage_path,
    content_type: payload.content_type || "application/octet-stream",
    review_status: "pending",
    review_note: "",
    uploaded_at: now,
    updated_at: now,
  });
  const created = await docRef.get();

  await writeAuditEntry({
    action: "document.uploaded",
    firebase_uid: uid,
    document_id: docRef.id,
    doc_type: payload.doc_type,
    actor,
  });

  return { id: created.id, ...created.data() };
}

function githubReposCollection() {
  return firestore.collection("github_repos");
}

function githubAssignmentsCollection() {
  return firestore.collection("github_repo_assignments");
}

async function resolveCapabilities(appId, role, explicitCapabilities) {
  if (explicitCapabilities && explicitCapabilities.length > 0) {
    return explicitCapabilities;
  }
  const capDoc = await appCapabilitiesCollection().doc(appId).get();
  if (!capDoc.exists) {
    if (role === "admin" || role === "owner") return ["*"];
    return [];
  }
  const presets = capDoc.data().role_presets || {};
  return presets[role] || [];
}

async function writeAuditEntry(entry) {
  const now = new Date().toISOString();
  await auditLogCollection().add({
    ...entry,
    timestamp: now,
  });
}

async function sendEmail({ to, subject, html }) {
  const toArray = Array.isArray(to) ? to : [to];
  await firestore.collection("mail").add({
    to: toArray,
    message: { subject, html },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function notifyAdminsForEvent(eventType, { subject, html }) {
  try {
    const snap = await notificationPreferencesCollection()
      .where("event_type", "==", eventType)
      .where("enabled", "==", true)
      .get();
    const emails = snap.docs.map((d) => d.data().recipient_email).filter(Boolean);
    if (emails.length > 0) {
      await sendEmail({ to: emails, subject, html });
    }
  } catch {
    /* email notification is best-effort */
  }
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
  const query = await usersCollection()
    .where("id", "==", inputId)
    .limit(1)
    .get();
  if (!query.empty) return query.docs[0].id;
  return inputId;
}

async function getActorFromRequest(req) {
  const header = String(req.headers.authorization || "");
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return null;
  try {
    const decoded = await auth.verifyIdToken(m[1]);
    return { uid: decoded.uid, decoded };
  } catch {
    return null;
  }
}

async function isPlatformAdmin(uid) {
  const snap = await usersCollection().doc(uid).get();
  const profileRole = snap.exists ? snap.data()?.role : undefined;
  if (profileRole === "admin") return true;
  const rec = await auth.getUser(uid);
  return rec.customClaims?.role === "admin";
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
  const workflowExecutionEnabled = parseBool(
    "WORKFLOW_EXECUTION_ENABLED",
    true,
  );
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
  if (
    firebaseUid &&
    (execution.state === "FAILED" || execution.state === "FAILED_TO_START")
  ) {
    await usersCollection()
      .doc(firebaseUid)
      .set(
        {
          workflow_failure_reason:
            execution.error || execution.result || "workflow failed",
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
    .limit(50)
    .get();
  const runs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  runs.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return runs.slice(0, 20);
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
    const profileStatus = profile.status;
    const status = profileStatus === "pending_approval"
      ? "pending_approval"
      : profileStatus === "rejected"
        ? "rejected"
        : u.disabled
          ? "offboarded"
          : "active";
    const defaultServices = getDefaultServicesForUser(role, status);
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
      service_synced_at: profile.service_synced_at || {},
      workflow_failure_reason: profile.workflow_failure_reason || null,
      status,
      provisioned_at: profile.provisioned_at || u.metadata.creationTime,
      last_modified: profile.last_modified || u.metadata.lastRefreshTime,
      services: {
        github: normalizeObservedServiceStatus(
          profile.services?.github,
          profile.service_messages?.github,
          defaultServices.github,
        ),
        slack: normalizeObservedServiceStatus(
          profile.services?.slack,
          profile.service_messages?.slack,
          defaultServices.slack,
        ),
        microsoft365: normalizeObservedServiceStatus(
          profile.services?.microsoft365,
          profile.service_messages?.microsoft365,
          defaultServices.microsoft365,
        ),
        gcp: normalizeObservedServiceStatus(
          profile.services?.gcp,
          profile.service_messages?.gcp,
          defaultServices.gcp,
        ),
        aws: normalizeObservedServiceStatus(
          profile.services?.aws,
          profile.service_messages?.aws,
          defaultServices.aws,
        ),
        portal: normalizeObservedServiceStatus(
          profile.services?.portal,
          profile.service_messages?.portal,
          defaultServices.portal,
        ),
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

function roleNeedsGithub(role) {
  return role === "admin" || role === "collaborator";
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

function roleNeedsCloud(role) {
  return role === "admin" || role === "collaborator";
}

function serviceApplicability(role) {
  return {
    github: roleNeedsGithub(role),
    slack: roleNeedsSlack(role),
    microsoft365: roleNeedsM365(role),
    gcp: roleNeedsCloud(role),
    aws: roleNeedsCloud(role),
    portal: true,
  };
}

function getDefaultServicesForUser(role, status) {
  if (status === "offboarded" || status === "pending_approval" || status === "rejected") {
    return {
      github: "not_applicable",
      slack: "not_applicable",
      microsoft365: "not_applicable",
      gcp: "not_applicable",
      aws: "not_applicable",
      portal: status === "pending_approval" ? "pending" : "not_applicable",
    };
  }
  const applicability = serviceApplicability(role);
  return {
    github: applicability.github ? "pending" : "not_applicable",
    slack: applicability.slack ? "pending" : "not_applicable",
    microsoft365: applicability.microsoft365 ? "pending" : "not_applicable",
    gcp: applicability.gcp ? "pending" : "not_applicable",
    aws: applicability.aws ? "pending" : "not_applicable",
    portal: applicability.portal ? "pending" : "not_applicable",
  };
}

function normalizeObservedServiceStatus(status, message, fallback) {
  if (!status) return fallback;
  return status;
}

async function computeQuotaCheck(role) {
  const users = await listUsersWithProfiles();
  const active = users.filter((u) => u.status === "active");
  const slackUsed = active.filter(
    (u) => u.services.slack === "provisioned",
  ).length;
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
  const slackOk =
    !roleNeedsSlack(role) || slackLimit === 0 || checks[0].available > 0;
  const m365Ok =
    !roleNeedsM365(role) || m365Limit === 0 || checks[1].available > 0;
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

app.post("/api/v1/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "email and password are required." });
    }
    const apiKey = await resolveFirebaseApiKey();
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "FIREBASE_API_KEY not configured on server." });
    }
    const authResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    const authData = await authResp.json();
    if (!authResp.ok) {
      const msg = authData?.error?.message || "Authentication failed.";
      return res.status(401).json({ error: msg });
    }
    const uid = authData.localId;
    let userRecord;
    try {
      userRecord = await auth.getUser(uid);
    } catch {
      return res.status(401).json({ error: "Firebase user record not found." });
    }
    res.json({
      token: authData.idToken,
      uid,
      email: userRecord.email,
      displayName: userRecord.displayName || "",
      role: userRecord.customClaims?.role || "client",
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/users", async (_req, res) => {
  try {
    const users = await listUsersWithProfiles();
    res.json({ users, total: users.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/firebase-users", async (_req, res) => {
  try {
    const listResult = await auth.listUsers(1000);
    const users = listResult.users.map((u) => ({
      uid: u.uid,
      email: u.email || "",
      display_name: u.displayName || "",
      disabled: u.disabled,
      custom_claims: u.customClaims || {},
    }));
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/users/:id", async (req, res) => {
  try {
    const users = await listUsersWithProfiles();
    const user = users.find(
      (u) => u.id === req.params.id || u.firebase_uid === req.params.id,
    );
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
    const workflowExecutionEnabled = parseBool(
      "WORKFLOW_EXECUTION_ENABLED",
      true,
    );

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
      const stsConfig = {
        region: process.env.AWS_REGION || "us-east-1",
      };
      if (secrets.awsAccessKeyId && secrets.awsSecretAccessKey) {
        stsConfig.credentials = {
          accessKeyId: secrets.awsAccessKeyId,
          secretAccessKey: secrets.awsSecretAccessKey,
          sessionToken: secrets.awsSessionToken || undefined,
        };
      }
      const stsClient = new STSClient(stsConfig);
      const identity = await stsClient.send(new GetCallerIdentityCommand({}));
      checks.push({
        provider: "aws-sts",
        ok: true,
        message: "AWS STS reachable.",
        details: identity,
        checked_at: new Date().toISOString(),
      });
    } catch (error) {
      checks.push({
        provider: "aws-sts",
        ok: false,
        message: `AWS auth failed. Ensure CLI/SSO is logged in or set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY. ${String(error)}`,
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
    const snapshot = await templatesCollection()
      .orderBy("updated_at", "desc")
      .get();
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
      return res
        .status(400)
        .json({ error: "Validation failed.", details: errors });
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
      return res
        .status(400)
        .json({ error: "Validation failed.", details: errors });
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
      return res
        .status(400)
        .json({ error: "name, email, and role are required." });
    }

    const quota = await computeQuotaCheck(payload.role);
    if (!quota.ok) {
      return res
        .status(409)
        .json({ error: quota.message, quota, code: "QUOTA_EXCEEDED" });
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
    const accessTemplate = await getAccessTemplateById(
      payload.access_template_id,
    );
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
      services: getDefaultServicesForUser(payload.role, "active"),
      service_synced_at: {},
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
      execution_error: execution.error || null,
      execution_result: execution.result || null,
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
      const serviceSyncedAt = {};
      let workflowFailureReason = null;
      for (const step of providerSteps) {
        if (step.service in profile.services) {
          serviceSyncedAt[step.service] = new Date().toISOString();
          if (step.status !== "success") {
            servicePatch[step.service] = "failed";
            serviceMessages[step.service] =
              step.message || "Provider execution failed.";
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
      await usersCollection()
        .doc(firebaseUser.uid)
        .set(
          {
            services: {
              ...profile.services,
              ...servicePatch,
            },
            service_messages: serviceMessages,
            service_synced_at: {
              ...(profile.service_synced_at || {}),
              ...serviceSyncedAt,
            },
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
      next.access_template = await getAccessTemplateById(
        payload.access_template_id,
      );
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
      execution_error: execution.error || null,
      execution_result: execution.result || null,
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
      actions.firebase === "delete" ||
      (!defaultDeactivate && actions.firebase !== "deactivate");

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

    const execution = await safeStartWorkflowExecution(
      WORKFLOW_NAMES.offboard,
      {
        firebase_uid: id,
        actions,
        source_project: FIREBASE_PROJECT_ID,
      },
    );
    await logWorkflowRun({
      firebase_uid: id,
      run_type: "offboard",
      workflow_name: WORKFLOW_NAMES.offboard,
      execution_name: execution.name,
      status: execution.state || "ACTIVE",
      execution_error: execution.error || null,
      execution_result: execution.result || null,
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
      const servicePatch = {};
      const serviceMessages = {};
      const serviceSyncedAt = {};
      let workflowFailureReason = null;
      for (const step of providerSteps) {
        if (step.service in (profile?.services || {})) {
          serviceSyncedAt[step.service] = new Date().toISOString();
          if (step.status !== "success") {
            servicePatch[step.service] = "failed";
            serviceMessages[step.service] =
              step.message || "Provider deprovision failed.";
            if (!workflowFailureReason) {
              workflowFailureReason = `${step.label}: ${step.message || "failed"}`;
            }
          } else {
            servicePatch[step.service] = "not_applicable";
            serviceMessages[step.service] = step.message || "offboarded";
          }
        }
      }
      await usersCollection()
        .doc(id)
        .set(
          {
            services: {
              ...(profile?.services || {}),
              ...servicePatch,
            },
            service_messages: serviceMessages,
            service_synced_at: {
              ...(profile?.service_synced_at || {}),
              ...serviceSyncedAt,
            },
            workflow_failure_reason: workflowFailureReason,
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
    const execution = await safeStartWorkflowExecution(
      WORKFLOW_NAMES.reprovision,
      {
        firebase_uid: id,
        profile,
        access_template: profile?.access_template || null,
        source_project: FIREBASE_PROJECT_ID,
      },
    );
    await logWorkflowRun({
      firebase_uid: id,
      run_type: "reprovision",
      workflow_name: WORKFLOW_NAMES.reprovision,
      execution_name: execution.name,
      status: execution.state || "ACTIVE",
      execution_error: execution.error || null,
      execution_result: execution.result || null,
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
      const serviceSyncedAt = {};
      let workflowFailureReason = null;
      for (const step of providerSteps) {
        if (step.service in (profile?.services || {})) {
          serviceSyncedAt[step.service] = new Date().toISOString();
          if (step.status !== "success") {
            servicePatch[step.service] = "failed";
            serviceMessages[step.service] =
              step.message || "Provider execution failed.";
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
          service_synced_at: {
            ...(profile?.service_synced_at || {}),
            ...serviceSyncedAt,
          },
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
    res.json({
      workflow_execution: execution.name,
      workflow_state: execution.state || "UNKNOWN",
      workflow_error: execution.error || null,
      provisioning_steps,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ---------------------------------------------------------------------------
// Applications registry
// ---------------------------------------------------------------------------

app.get("/api/v1/apps", async (_req, res) => {
  try {
    const snapshot = await applicationsCollection().orderBy("name").get();
    const applications = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json({ applications, total: applications.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/apps/sync-history", async (_req, res) => {
  try {
    const snapshot = await appSyncHistoryCollection()
      .orderBy("created_at", "desc")
      .limit(20)
      .get();
    const runs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ runs, total: runs.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/apps/:id", async (req, res) => {
  try {
    const ref = applicationsCollection().doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Application not found." });
    }
    res.json({ application: { id: doc.id, ...doc.data() } });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.put("/api/v1/apps/:id", async (req, res) => {
  try {
    const ref = applicationsCollection().doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Application not found." });
    }
    const allowed = [
      "name",
      "category",
      "environments",
      "owner_team",
      "default_template_id",
      "status",
    ];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    patch.updated_at = new Date().toISOString();
    await ref.set(patch, { merge: true });
    const updated = await ref.get();
    res.json({ application: { id: updated.id, ...updated.data() } });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/apps/seed", async (_req, res) => {
  try {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const dir = dirname(fileURLToPath(import.meta.url));
    const seedPath = join(dir, "seeds", "applications.initial.json");
    const seedData = JSON.parse(readFileSync(seedPath, "utf8"));

    const snapshot = await applicationsCollection().get();
    const existingIds = new Set();
    for (const doc of snapshot.docs) {
      existingIds.add(doc.data().app_id || doc.id);
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];
    const now = new Date().toISOString();

    for (const entry of seedData) {
      if (!entry.app_id || !entry.name) {
        errors.push(
          `Skipped invalid seed entry: ${JSON.stringify(entry).slice(0, 80)}`,
        );
        skipped++;
        continue;
      }
      if (existingIds.has(entry.app_id)) {
        const existing = snapshot.docs.find(
          (d) => (d.data().app_id || d.id) === entry.app_id,
        );
        if (existing) {
          await existing.ref.set(
            {
              ...entry,
              status: existing.data().status || "active",
              updated_at: now,
            },
            { merge: true },
          );
        }
        updated++;
      } else {
        await applicationsCollection()
          .doc(entry.app_id)
          .set({
            ...entry,
            status: "active",
            created_at: now,
            updated_at: now,
          });
        created++;
      }
    }

    const result = {
      created,
      updated,
      skipped,
      errors,
      synced_at: now,
      source: "seed-file",
    };
    await appSyncHistoryCollection().add({ ...result, created_at: now });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/apps/sync", async (_req, res) => {
  try {
    const snapshot = await applicationsCollection().get();
    const existing = new Map();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      existing.set(data.app_id || doc.id, { ref: doc.ref, data });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];
    const now = new Date().toISOString();

    for (const [docId, entry] of existing) {
      if (!entry.data.app_id || !entry.data.name) {
        errors.push(`Invalid app record: ${docId} — missing app_id or name.`);
        skipped++;
        continue;
      }
      if (!entry.data.status) {
        await entry.ref.set(
          { status: "active", updated_at: now },
          { merge: true },
        );
        updated++;
      } else {
        skipped++;
      }
    }

    const result = { created, updated, skipped, errors, synced_at: now };
    await appSyncHistoryCollection().add({ ...result, created_at: now });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ---------------------------------------------------------------------------
// App entitlements (user/group -> app access)
// ---------------------------------------------------------------------------

app.get("/api/v1/apps/:appId/entitlements", async (req, res) => {
  try {
    const snapshot = await appEntitlementsCollection()
      .where("app_id", "==", req.params.appId)
      .get();
    const entitlements = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    res.json({ entitlements, total: entitlements.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/apps/:appId/entitlements", async (req, res) => {
  try {
    const payload = req.body || {};
    const appId = req.params.appId;
    if (!payload.subject_type || !payload.subject_id || !payload.role) {
      return res
        .status(400)
        .json({ error: "subject_type, subject_id, and role are required." });
    }
    if (!["user", "group"].includes(payload.subject_type)) {
      return res
        .status(400)
        .json({ error: "subject_type must be 'user' or 'group'." });
    }
    if (!["viewer", "editor", "admin", "owner"].includes(payload.role)) {
      return res
        .status(400)
        .json({ error: "role must be viewer, editor, admin, or owner." });
    }

    const appRef = applicationsCollection().doc(appId);
    const appDoc = await appRef.get();
    if (!appDoc.exists) {
      return res.status(404).json({ error: "Application not found." });
    }

    const existing = await appEntitlementsCollection()
      .where("app_id", "==", appId)
      .where("subject_type", "==", payload.subject_type)
      .where("subject_id", "==", payload.subject_id)
      .limit(1)
      .get();
    if (!existing.empty) {
      const doc = existing.docs[0];
      await doc.ref.set(
        {
          role: payload.role,
          capabilities: Array.isArray(payload.capabilities)
            ? payload.capabilities
            : doc.data().capabilities || [],
          environments:
            payload.environments || appDoc.data().environments || [],
          subject_label: payload.subject_label || doc.data().subject_label,
          granted_by: payload.granted_by || "admin",
          expires_at: payload.expires_at || null,
          updated_at: new Date().toISOString(),
        },
        { merge: true },
      );
      const updated = await doc.ref.get();
      await writeAuditEntry({
        action: "entitlement.updated",
        app_id: appId,
        subject_type: payload.subject_type,
        subject_id: payload.subject_id,
        role: payload.role,
        actor: payload.granted_by || "admin",
      });
      return res.json({ entitlement: { id: updated.id, ...updated.data() } });
    }

    const now = new Date().toISOString();
    const docRef = await appEntitlementsCollection().add({
      app_id: appId,
      subject_type: payload.subject_type,
      subject_id: payload.subject_id,
      subject_label: payload.subject_label || payload.subject_id,
      role: payload.role,
      capabilities: Array.isArray(payload.capabilities)
        ? payload.capabilities
        : [],
      environments: payload.environments || appDoc.data().environments || [],
      granted_by: payload.granted_by || "admin",
      expires_at: payload.expires_at || null,
      created_at: now,
      updated_at: now,
    });
    const created = await docRef.get();
    await writeAuditEntry({
      action: "entitlement.granted",
      app_id: appId,
      subject_type: payload.subject_type,
      subject_id: payload.subject_id,
      role: payload.role,
      actor: payload.granted_by || "admin",
    });
    res
      .status(201)
      .json({ entitlement: { id: created.id, ...created.data() } });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete("/api/v1/apps/:appId/entitlements/:entId", async (req, res) => {
  try {
    const ref = appEntitlementsCollection().doc(req.params.entId);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Entitlement not found." });
    }
    if (doc.data().app_id !== req.params.appId) {
      return res
        .status(404)
        .json({ error: "Entitlement does not belong to this app." });
    }
    const entData = doc.data();
    await ref.delete();
    await writeAuditEntry({
      action: "entitlement.revoked",
      app_id: req.params.appId,
      subject_type: entData.subject_type,
      subject_id: entData.subject_id,
      role: entData.role,
      actor: "admin",
    });
    res.json({ revoked: true, id: req.params.entId });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ---------------------------------------------------------------------------
// User groups
// ---------------------------------------------------------------------------

app.get("/api/v1/groups", async (_req, res) => {
  try {
    const snapshot = await groupsCollection().orderBy("name").get();
    const groups = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ groups, total: groups.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/groups/:id", async (req, res) => {
  try {
    const ref = groupsCollection().doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Group not found." });
    }
    res.json({ group: { id: doc.id, ...doc.data() } });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/groups", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.group_id || !payload.name) {
      return res.status(400).json({ error: "group_id and name are required." });
    }
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(payload.group_id)) {
      return res.status(400).json({
        error:
          "group_id must be lowercase alphanumeric with hyphens/underscores.",
      });
    }
    const existing = await groupsCollection().doc(payload.group_id).get();
    if (existing.exists) {
      return res
        .status(409)
        .json({ error: "A group with this ID already exists." });
    }
    const now = new Date().toISOString();
    await groupsCollection()
      .doc(payload.group_id)
      .set({
        group_id: payload.group_id,
        name: payload.name.trim(),
        description: (payload.description || "").trim(),
        members: [],
        created_at: now,
        updated_at: now,
      });
    const created = await groupsCollection().doc(payload.group_id).get();
    res.status(201).json({ group: { id: created.id, ...created.data() } });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.put("/api/v1/groups/:id", async (req, res) => {
  try {
    const ref = groupsCollection().doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Group not found." });
    }
    const allowed = ["name", "description"];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    patch.updated_at = new Date().toISOString();
    await ref.set(patch, { merge: true });
    const updated = await ref.get();
    res.json({ group: { id: updated.id, ...updated.data() } });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete("/api/v1/groups/:id", async (req, res) => {
  try {
    const ref = groupsCollection().doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Group not found." });
    }
    const entSnapshot = await appEntitlementsCollection()
      .where("subject_type", "==", "group")
      .where("subject_id", "==", req.params.id)
      .limit(1)
      .get();
    if (!entSnapshot.empty) {
      return res.status(409).json({
        error:
          "Group has active app entitlements. Revoke them before deleting.",
      });
    }
    await ref.delete();
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/groups/:id/members", async (req, res) => {
  try {
    const ref = groupsCollection().doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Group not found." });
    }
    const payload = req.body || {};
    if (!payload.firebase_uid) {
      return res.status(400).json({ error: "firebase_uid is required." });
    }
    const data = doc.data();
    const members = data.members || [];
    if (members.some((m) => m.firebase_uid === payload.firebase_uid)) {
      return res.json({ group: { id: doc.id, ...data } });
    }
    members.push({
      firebase_uid: payload.firebase_uid,
      name: payload.name || "",
      email: payload.email || "",
      added_at: new Date().toISOString(),
    });
    await ref.set(
      { members, updated_at: new Date().toISOString() },
      { merge: true },
    );
    await writeAuditEntry({
      action: "group.member_added",
      group_id: req.params.id,
      firebase_uid: payload.firebase_uid,
      actor: "admin",
    });
    const updated = await ref.get();
    res.json({ group: { id: updated.id, ...updated.data() } });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete("/api/v1/groups/:id/members/:uid", async (req, res) => {
  try {
    const ref = groupsCollection().doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Group not found." });
    }
    const data = doc.data();
    const members = (data.members || []).filter(
      (m) => m.firebase_uid !== req.params.uid,
    );
    await ref.set(
      { members, updated_at: new Date().toISOString() },
      { merge: true },
    );
    await writeAuditEntry({
      action: "group.member_removed",
      group_id: req.params.id,
      firebase_uid: req.params.uid,
      actor: "admin",
    });
    const updated = await ref.get();
    res.json({ group: { id: updated.id, ...updated.data() } });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ---------------------------------------------------------------------------
// Effective access + Audit log + Bulk group assign
// ---------------------------------------------------------------------------

app.get("/api/v1/users/:id/effective-access", async (req, res) => {
  try {
    const uid = req.params.id;
    const groupSnapshot = await groupsCollection().get();
    const userGroupIds = [];
    for (const doc of groupSnapshot.docs) {
      const data = doc.data();
      if ((data.members || []).some((m) => m.firebase_uid === uid)) {
        userGroupIds.push(data.group_id || doc.id);
      }
    }

    const entSnapshot = await appEntitlementsCollection().get();
    const directEntitlements = [];
    const groupEntitlements = [];
    for (const doc of entSnapshot.docs) {
      const ent = { id: doc.id, ...doc.data() };
      if (ent.subject_type === "user" && ent.subject_id === uid) {
        directEntitlements.push(ent);
      } else if (
        ent.subject_type === "group" &&
        userGroupIds.includes(ent.subject_id)
      ) {
        groupEntitlements.push(ent);
      }
    }

    const appIds = new Set([
      ...directEntitlements.map((e) => e.app_id),
      ...groupEntitlements.map((e) => e.app_id),
    ]);
    const appSnapshot = await applicationsCollection().get();
    const appMap = {};
    for (const doc of appSnapshot.docs) {
      const data = doc.data();
      appMap[data.app_id || doc.id] = { id: doc.id, ...data };
    }

    const capSnapshot = await appCapabilitiesCollection().get();
    const capMap = {};
    for (const doc of capSnapshot.docs) {
      capMap[doc.id] = doc.data();
    }

    const effectiveAccess = [...appIds].map((appId) => {
      const direct = directEntitlements.filter((e) => e.app_id === appId);
      const viaGroup = groupEntitlements.filter((e) => e.app_id === appId);
      const allGrants = [...direct, ...viaGroup];
      const roleRank = { owner: 4, admin: 3, editor: 2, viewer: 1 };
      allGrants.sort(
        (a, b) => (roleRank[b.role] || 0) - (roleRank[a.role] || 0),
      );
      const best = allGrants[0];
      const highestRole = best?.role;
      let capabilities = [];
      if (best) {
        if (best.capabilities && best.capabilities.length > 0) {
          capabilities = best.capabilities;
        } else {
          const presets = capMap[appId]?.role_presets || {};
          capabilities =
            presets[highestRole] ||
            (highestRole === "admin" || highestRole === "owner" ? ["*"] : []);
        }
      }
      return {
        app_id: appId,
        app_name: appMap[appId]?.name || appId,
        app_category: appMap[appId]?.category || "unknown",
        effective_role: highestRole,
        capabilities,
        direct_grants: direct,
        group_grants: viaGroup,
      };
    });

    res.json({
      firebase_uid: uid,
      groups: userGroupIds,
      effective_access: effectiveAccess,
      total_apps: effectiveAccess.length,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/audit-log", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const snapshot = await auditLogCollection()
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();
    const entries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ entries, total: entries.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/audit-log/app/:appId", async (req, res) => {
  try {
    const snapshot = await auditLogCollection()
      .where("app_id", "==", req.params.appId)
      .get();
    const entries = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    res.json({ entries, total: entries.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/groups/:id/bulk-assign", async (req, res) => {
  try {
    const groupId = req.params.id;
    const groupDoc = await groupsCollection().doc(groupId).get();
    if (!groupDoc.exists) {
      return res.status(404).json({ error: "Group not found." });
    }
    const groupData = groupDoc.data();
    const payload = req.body || {};
    const appIds = payload.app_ids || [];
    const role = payload.role || "viewer";
    if (!Array.isArray(appIds) || appIds.length === 0) {
      return res.status(400).json({ error: "app_ids array is required." });
    }
    if (!["viewer", "editor", "admin", "owner"].includes(role)) {
      return res
        .status(400)
        .json({ error: "role must be viewer, editor, admin, or owner." });
    }
    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;
    const errors = [];

    for (const appId of appIds) {
      try {
        const appDoc = await applicationsCollection().doc(appId).get();
        if (!appDoc.exists) {
          errors.push(`App not found: ${appId}`);
          continue;
        }
        const existing = await appEntitlementsCollection()
          .where("app_id", "==", appId)
          .where("subject_type", "==", "group")
          .where("subject_id", "==", groupId)
          .limit(1)
          .get();
        if (!existing.empty) {
          const doc = existing.docs[0];
          await doc.ref.set({ role, updated_at: now }, { merge: true });
          updated++;
        } else {
          await appEntitlementsCollection().add({
            app_id: appId,
            subject_type: "group",
            subject_id: groupId,
            subject_label: groupData.name || groupId,
            role,
            environments: appDoc.data().environments || [],
            granted_by: payload.granted_by || "admin",
            expires_at: null,
            created_at: now,
            updated_at: now,
          });
          created++;
        }
        await writeAuditEntry({
          action: "entitlement.bulk_granted",
          app_id: appId,
          subject_type: "group",
          subject_id: groupId,
          role,
          actor: payload.granted_by || "admin",
        });
      } catch (err) {
        errors.push(`${appId}: ${String(err)}`);
      }
    }

    res.json({ created, updated, errors, total_apps: appIds.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ---------------------------------------------------------------------------
// App capabilities
// ---------------------------------------------------------------------------

app.get("/api/v1/apps/:appId/capabilities", async (req, res) => {
  try {
    const doc = await appCapabilitiesCollection().doc(req.params.appId).get();
    if (!doc.exists) {
      return res.json({
        definition: {
          app_id: req.params.appId,
          capabilities: [],
          role_presets: { viewer: [], editor: [], admin: ["*"], owner: ["*"] },
          updated_at: null,
        },
      });
    }
    res.json({ definition: { app_id: doc.id, ...doc.data() } });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.put("/api/v1/apps/:appId/capabilities", async (req, res) => {
  try {
    const appId = req.params.appId;
    const appDoc = await applicationsCollection().doc(appId).get();
    if (!appDoc.exists) {
      return res.status(404).json({ error: "Application not found." });
    }
    const payload = req.body || {};
    if (!Array.isArray(payload.capabilities)) {
      return res.status(400).json({ error: "capabilities array is required." });
    }
    for (const cap of payload.capabilities) {
      if (
        !cap.key ||
        !cap.label ||
        !["view", "control"].includes(cap.category)
      ) {
        return res.status(400).json({
          error: `Invalid capability: each must have key, label, and category (view|control). Got: ${JSON.stringify(cap)}`,
        });
      }
    }
    const now = new Date().toISOString();
    const data = {
      app_id: appId,
      capabilities: payload.capabilities,
      role_presets: payload.role_presets || {
        viewer: [],
        editor: [],
        admin: ["*"],
        owner: ["*"],
      },
      updated_at: now,
    };
    await appCapabilitiesCollection().doc(appId).set(data);
    await writeAuditEntry({
      action: "capabilities.updated",
      app_id: appId,
      actor: "admin",
    });
    res.json({ definition: data });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/authorize", async (req, res) => {
  try {
    const appId = String(req.query.app_id || "");
    const uid = String(req.query.uid || "");
    const env = String(req.query.env || "");
    if (!appId || !uid) {
      return res
        .status(400)
        .json({ error: "app_id and uid are required query parameters." });
    }

    const groupSnapshot = await groupsCollection().get();
    const userGroupIds = [];
    for (const doc of groupSnapshot.docs) {
      const data = doc.data();
      if ((data.members || []).some((m) => m.firebase_uid === uid)) {
        userGroupIds.push(data.group_id || doc.id);
      }
    }

    const entSnapshot = await appEntitlementsCollection()
      .where("app_id", "==", appId)
      .get();
    let bestRole = null;
    let bestRank = 0;
    let bestSource = "none";
    let bestCapabilities = null;
    let bestEnvironments = [];
    const roleRank = { viewer: 1, editor: 2, admin: 3, owner: 4 };

    for (const doc of entSnapshot.docs) {
      const ent = doc.data();
      const isDirectMatch =
        ent.subject_type === "user" && ent.subject_id === uid;
      const isGroupMatch =
        ent.subject_type === "group" && userGroupIds.includes(ent.subject_id);
      if (!isDirectMatch && !isGroupMatch) continue;
      if (
        env &&
        ent.environments &&
        ent.environments.length > 0 &&
        !ent.environments.includes(env)
      )
        continue;

      const rank = roleRank[ent.role] || 0;
      if (rank > bestRank) {
        bestRank = rank;
        bestRole = ent.role;
        bestSource = isDirectMatch ? "direct" : "group";
        bestCapabilities = ent.capabilities || null;
        bestEnvironments = ent.environments || [];
      }
    }

    const profileSnap = await usersCollection().doc(uid).get();
    const userStatus = profileSnap.exists ? profileSnap.data()?.status || "unknown" : "unknown";

    if (!bestRole) {
      return res.json({
        authorized: false,
        role: null,
        capabilities: [],
        source: "none",
        environments: [],
        user_status: userStatus,
      });
    }

    const capabilities = await resolveCapabilities(
      appId,
      bestRole,
      bestCapabilities,
    );
    res.json({
      authorized: true,
      role: bestRole,
      capabilities,
      source: bestSource,
      environments: bestEnvironments,
      user_status: userStatus,
    });
  } catch (error) {
    res.json({
      authorized: false,
      role: null,
      capabilities: [],
      source: "none",
      environments: [],
      error: String(error),
    });
  }
});

app.post("/api/v1/apps/capabilities/seed", async (_req, res) => {
  try {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const dir = dirname(fileURLToPath(import.meta.url));
    const seedPath = join(dir, "seeds", "app-capabilities.initial.json");
    const seedData = JSON.parse(readFileSync(seedPath, "utf8"));

    let created = 0;
    let updated = 0;
    const now = new Date().toISOString();

    for (const entry of seedData) {
      if (!entry.app_id || !Array.isArray(entry.capabilities)) continue;
      const ref = appCapabilitiesCollection().doc(entry.app_id);
      const existing = await ref.get();
      await ref.set({ ...entry, updated_at: now });
      if (existing.exists) updated++;
      else created++;
    }

    res.json({ created, updated, synced_at: now, source: "seed-file" });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ---------------------------------------------------------------------------
// Settings endpoints (profile update, password change)
// ---------------------------------------------------------------------------

app.put("/api/v1/settings/profile", async (req, res) => {
  try {
    const { uid, displayName } = req.body || {};
    if (!uid) return res.status(400).json({ error: "uid is required." });
    const actor = await getActorFromRequest(req);
    if (!actor) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (uid !== actor.uid && !(await isPlatformAdmin(actor.uid))) {
      return res.status(403).json({ error: "You can only update your own profile unless you are an admin." });
    }
    const updates = {};
    if (displayName !== undefined) updates.displayName = displayName;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update." });
    }
    await auth.updateUser(uid, updates);
    const updated = await auth.getUser(uid);
    const profileRef = usersCollection().doc(uid);
    const profileDoc = await profileRef.get();
    if (profileDoc.exists && displayName) {
      await profileRef.set(
        { name: displayName, last_modified: new Date().toISOString() },
        { merge: true },
      );
    }
    res.json({
      user: {
        firebase_uid: updated.uid,
        email: updated.email,
        displayName: updated.displayName,
      },
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/settings/change-password", async (req, res) => {
  try {
    const { uid, newPassword } = req.body || {};
    if (!uid || !newPassword) {
      return res
        .status(400)
        .json({ error: "uid and newPassword are required." });
    }
    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters." });
    }
    const actor = await getActorFromRequest(req);
    if (!actor) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const targetUid = await resolveUserUid(uid);
    if (targetUid !== actor.uid && !(await isPlatformAdmin(actor.uid))) {
      return res.status(403).json({
        error: "Only platform admins can change another user's password.",
      });
    }
    await auth.updateUser(targetUid, { password: newPassword });
    await writeAuditEntry({
      action: "settings.password_changed",
      firebase_uid: targetUid,
      actor: actor.uid,
      target_self: targetUid === actor.uid,
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ---------------------------------------------------------------------------
// Admin dashboard endpoints
// ---------------------------------------------------------------------------

app.get("/api/v1/admin/stats", async (_req, res) => {
  try {
    const [authUsers, appsSnap, groupsSnap, entSnap, auditSnap, capSnap] =
      await Promise.all([
        auth.listUsers(1000),
        applicationsCollection().get(),
        groupsCollection().get(),
        appEntitlementsCollection().get(),
        auditLogCollection().orderBy("timestamp", "desc").limit(10).get(),
        appCapabilitiesCollection().get(),
      ]);

    const activeUsers = authUsers.users.filter((u) => !u.disabled).length;
    const disabledUsers = authUsers.users.filter((u) => u.disabled).length;
    const totalMembers = groupsSnap.docs.reduce(
      (sum, doc) => sum + (doc.data().members || []).length,
      0,
    );
    const appsWithCaps = capSnap.docs.filter(
      (d) => (d.data().capabilities || []).length > 0,
    ).length;

    const recentAudit = auditSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      users: {
        total: authUsers.users.length,
        active: activeUsers,
        disabled: disabledUsers,
      },
      apps: { total: appsSnap.size, with_capabilities: appsWithCaps },
      groups: { total: groupsSnap.size, total_members: totalMembers },
      entitlements: { total: entSnap.size },
      recent_audit: recentAudit,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/notifications/welcome", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "email is required." });
    const link = await auth.generatePasswordResetLink(email);
    res.json({
      success: true,
      message: `Password reset link generated for ${email}. In production this would be emailed via Firebase.`,
      reset_link: link,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ---------------------------------------------------------------------------
// Self-service signup (creates pending_approval profile + onboarding request)
// ---------------------------------------------------------------------------

app.post("/api/v1/signup", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.email || !payload.name || !payload.password) {
      return res.status(400).json({ error: "name, email, and password are required." });
    }
    if (payload.password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const firebaseUser = await auth.createUser({
      email: payload.email,
      displayName: payload.name,
      password: payload.password,
      disabled: true,
    });

    await auth.setCustomUserClaims(firebaseUser.uid, {
      role: "client",
      source: "self-signup",
    });

    const now = new Date().toISOString();
    const profile = {
      id: firebaseUser.uid,
      name: payload.name,
      email: payload.email,
      role: "client",
      status: "pending_approval",
      company: payload.company || null,
      phone: payload.phone || null,
      provisioned_at: null,
      last_modified: now,
      created_at: now,
      services: getDefaultServicesForUser("client", "pending_approval"),
    };
    await usersCollection().doc(firebaseUser.uid).set(profile);

    const requestDoc = {
      firebase_uid: firebaseUser.uid,
      applicant_name: payload.name,
      applicant_email: payload.email,
      company: payload.company || null,
      phone: payload.phone || null,
      service_type: payload.service_type || "general",
      selected_options: payload.selected_options || [],
      expected_aum: payload.expected_aum || null,
      status: "pending",
      reviewer_uid: null,
      review_note: "",
      created_at: now,
      updated_at: now,
    };
    const reqRef = await onboardingRequestsCollection().add(requestDoc);

    await writeAuditEntry({
      action: "signup.submitted",
      firebase_uid: firebaseUser.uid,
      applicant_email: payload.email,
      onboarding_request_id: reqRef.id,
      actor: "self",
    });

    try {
      await sendEmail({
        to: payload.email,
        subject: "Application received — under review",
        html: `<p>Hi ${payload.name},</p><p>Thank you for your application. Our team is reviewing your submission and you will receive an email once a decision has been made.</p><p>Your application reference: <strong>${reqRef.id}</strong></p>`,
      });
      await notifyAdminsForEvent("signup_submitted", {
        subject: `New signup requires review: ${payload.email}`,
        html: `<p>A new account application has been submitted:</p><ul><li><strong>Name:</strong> ${payload.name}</li><li><strong>Email:</strong> ${payload.email}</li><li><strong>Company:</strong> ${payload.company || "N/A"}</li><li><strong>Service:</strong> ${payload.service_type || "general"}</li></ul><p>Please review in the admin dashboard.</p>`,
      });
    } catch {
      /* email is best-effort */
    }

    res.status(201).json({
      user: { ...profile, firebase_uid: firebaseUser.uid },
      onboarding_request_id: reqRef.id,
    });
  } catch (error) {
    if (String(error).includes("email-already-exists")) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    res.status(500).json({ error: String(error) });
  }
});

// ---------------------------------------------------------------------------
// Onboarding requests (admin queue)
// ---------------------------------------------------------------------------

app.get("/api/v1/onboarding-requests", async (req, res) => {
  try {
    const status = req.query.status;
    let query = onboardingRequestsCollection().orderBy("created_at", "desc");
    if (status) {
      query = onboardingRequestsCollection()
        .where("status", "==", status)
        .orderBy("created_at", "desc");
    }
    const snapshot = await query.limit(200).get();
    const requests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ requests, total: requests.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/onboarding-requests/:id", async (req, res) => {
  try {
    const ref = onboardingRequestsCollection().doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Onboarding request not found." });
    }
    const docsSnapshot = await userDocumentsCollection()
      .where("onboarding_request_id", "==", req.params.id)
      .get();
    const documents = docsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ request: { id: doc.id, ...doc.data() }, documents });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/onboarding-requests/:id/approve", async (req, res) => {
  try {
    const actor = await getActorFromRequest(req);
    if (!actor) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!(await isPlatformAdmin(actor.uid))) {
      return res.status(403).json({ error: "Only admins can approve requests." });
    }

    const ref = onboardingRequestsCollection().doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Onboarding request not found." });
    }
    const request = doc.data();
    if (request.status !== "pending") {
      return res.status(409).json({ error: `Request is already ${request.status}.` });
    }

    const now = new Date().toISOString();
    const note = req.body?.note || "";
    const role = req.body?.role || "client";
    const appGrants = Array.isArray(req.body?.app_grants) ? req.body.app_grants : [];

    await auth.updateUser(request.firebase_uid, { disabled: false });
    await auth.setCustomUserClaims(request.firebase_uid, { role, source: "admin-approved" });

    await usersCollection().doc(request.firebase_uid).set(
      {
        status: "active",
        role,
        provisioned_at: now,
        last_modified: now,
        services: getDefaultServicesForUser(role, "active"),
      },
      { merge: true },
    );

    await ref.set(
      {
        status: "approved",
        reviewer_uid: actor.uid,
        review_note: note,
        updated_at: now,
      },
      { merge: true },
    );

    const grantedApps = [];
    for (const grant of appGrants) {
      if (!grant.app_id) continue;
      const existing = await appEntitlementsCollection()
        .where("app_id", "==", grant.app_id)
        .where("subject_type", "==", "user")
        .where("subject_id", "==", request.firebase_uid)
        .limit(1)
        .get();
      if (!existing.empty) {
        await existing.docs[0].ref.set(
          { role: grant.role || "viewer", environments: grant.environments || ["prod"], updated_at: now },
          { merge: true },
        );
      } else {
        await appEntitlementsCollection().add({
          app_id: grant.app_id,
          subject_type: "user",
          subject_id: request.firebase_uid,
          subject_label: request.applicant_name || request.applicant_email,
          role: grant.role || "viewer",
          environments: grant.environments || ["prod"],
          granted_by: actor.uid,
          created_at: now,
          updated_at: now,
        });
      }
      grantedApps.push(grant.app_id);
    }

    await writeAuditEntry({
      action: "signup.approved",
      firebase_uid: request.firebase_uid,
      onboarding_request_id: req.params.id,
      reviewer_uid: actor.uid,
      note,
      granted_apps: grantedApps,
      actor: actor.uid,
    });

    try {
      await sendEmail({
        to: request.applicant_email,
        subject: "Your account has been approved",
        html: `<h2>Welcome!</h2><p>Hi ${request.applicant_name || "there"},</p><p>Your account has been approved and is now active. You can log in using the email and password you registered with.</p>${note ? `<p><strong>Reviewer note:</strong> ${note}</p>` : ""}<p>Thank you for joining us.</p>`,
      });
      await notifyAdminsForEvent("signup_approved", {
        subject: `Account approved: ${request.applicant_email}`,
        html: `<p><strong>${request.applicant_name}</strong> (${request.applicant_email}) has been approved by admin.</p>${grantedApps.length > 0 ? `<p>Granted apps: ${grantedApps.join(", ")}</p>` : ""}`,
      });
    } catch {
      /* email is best-effort */
    }

    res.json({
      request: { id: doc.id, ...(await ref.get()).data() },
      user_status: "active",
      granted_apps: grantedApps,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/onboarding-requests/:id/reject", async (req, res) => {
  try {
    const actor = await getActorFromRequest(req);
    if (!actor) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!(await isPlatformAdmin(actor.uid))) {
      return res.status(403).json({ error: "Only admins can reject requests." });
    }

    const ref = onboardingRequestsCollection().doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Onboarding request not found." });
    }
    const request = doc.data();
    if (request.status !== "pending") {
      return res.status(409).json({ error: `Request is already ${request.status}.` });
    }

    const now = new Date().toISOString();
    const note = req.body?.note || "";
    const deleteUser = req.body?.delete_user === true;

    if (deleteUser) {
      try {
        await auth.deleteUser(request.firebase_uid);
      } catch {
        /* user may already be deleted */
      }
      await usersCollection().doc(request.firebase_uid).delete();
    } else {
      await usersCollection().doc(request.firebase_uid).set(
        { status: "rejected", last_modified: now },
        { merge: true },
      );
    }

    await ref.set(
      {
        status: "rejected",
        reviewer_uid: actor.uid,
        review_note: note,
        updated_at: now,
      },
      { merge: true },
    );

    await writeAuditEntry({
      action: "signup.rejected",
      firebase_uid: request.firebase_uid,
      onboarding_request_id: req.params.id,
      reviewer_uid: actor.uid,
      note,
      deleted: deleteUser,
      actor: actor.uid,
    });

    try {
      await sendEmail({
        to: request.applicant_email,
        subject: "Update on your application",
        html: `<p>Hi ${request.applicant_name || "there"},</p><p>We have reviewed your application and unfortunately we are unable to proceed at this time.</p>${note ? `<p><strong>Note:</strong> ${note}</p>` : ""}<p>If you have questions, please contact our support team.</p>`,
      });
      await notifyAdminsForEvent("signup_rejected", {
        subject: `Application rejected: ${request.applicant_email}`,
        html: `<p><strong>${request.applicant_name}</strong> (${request.applicant_email}) application was rejected.</p>${note ? `<p>Note: ${note}</p>` : ""}`,
      });
    } catch {
      /* email is best-effort */
    }

    res.json({ request: { id: doc.id, ...(await ref.get()).data() } });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ---------------------------------------------------------------------------
// User documents (metadata — files stored in Firebase Storage by client)
// ---------------------------------------------------------------------------

app.get("/api/v1/users/:uid/documents", async (req, res) => {
  try {
    const snapshot = await userDocumentsCollection()
      .where("firebase_uid", "==", req.params.uid)
      .orderBy("uploaded_at", "desc")
      .get();
    const documents = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ documents, total: documents.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/users/:uid/documents", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.doc_type || !payload.file_name || !payload.storage_path) {
      return res.status(400).json({ error: "doc_type, file_name, and storage_path are required." });
    }
    const document = await createUserDocumentRecord(req.params.uid, payload, "user");
    res.status(201).json({ document });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/users/:uid/documents/upload", async (req, res) => {
  try {
    const payload = req.body || {};
    if (
      !payload.doc_type ||
      !payload.file_name ||
      !payload.content_type ||
      !payload.file_base64
    ) {
      return res.status(400).json({
        error:
          "doc_type, file_name, content_type, and file_base64 are required.",
      });
    }

    const safeFileName = sanitizeFileName(payload.file_name);
    const storagePath = `onboarding-docs/${req.params.uid}/${payload.onboarding_request_id || "draft"}/${Date.now()}-${payload.doc_type}-${safeFileName}`;
    const storageFile = storageBucket.file(storagePath);
    const fileBuffer = Buffer.from(String(payload.file_base64), "base64");

    await storageFile.save(fileBuffer, {
      contentType: payload.content_type,
      resumable: false,
      metadata: {
        cacheControl: "private, max-age=0, no-store",
      },
    });

    const document = await createUserDocumentRecord(
      req.params.uid,
      {
        onboarding_request_id: payload.onboarding_request_id || null,
        doc_type: payload.doc_type,
        file_name: payload.file_name,
        storage_path: storagePath,
        content_type: payload.content_type,
      },
      "system",
    );

    res.status(201).json({
      document,
      upload: {
        storage_path: storagePath,
      },
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.put("/api/v1/users/:uid/documents/:docId/review", async (req, res) => {
  try {
    const actor = await getActorFromRequest(req);
    if (!actor) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!(await isPlatformAdmin(actor.uid))) {
      return res.status(403).json({ error: "Only admins can review documents." });
    }

    const ref = userDocumentsCollection().doc(req.params.docId);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Document not found." });
    }
    if (doc.data().firebase_uid !== req.params.uid) {
      return res.status(404).json({ error: "Document does not belong to this user." });
    }

    const status = req.body?.status;
    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ error: "status must be approved, rejected, or pending." });
    }

    await ref.set(
      {
        review_status: status,
        review_note: req.body?.note || "",
        reviewed_by: actor.uid,
        updated_at: new Date().toISOString(),
      },
      { merge: true },
    );

    await writeAuditEntry({
      action: `document.${status}`,
      firebase_uid: req.params.uid,
      document_id: req.params.docId,
      actor: actor.uid,
    });

    const updated = await ref.get();
    res.json({ document: { id: updated.id, ...updated.data() } });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ---------------------------------------------------------------------------
// GitHub repo discovery + assignment
// ---------------------------------------------------------------------------

const GITHUB_ROLES = ["pull", "triage", "push", "maintain", "admin"];

app.post("/api/v1/github/discover", async (_req, res) => {
  try {
    const secrets = await loadProviderSecrets();
    if (!secrets.githubToken) {
      return res.status(500).json({ error: "GitHub token not configured." });
    }
    const owner = process.env.GITHUB_ORG || "IggyIkenna";
    const allRepos = [];
    let page = 1;

    const orgCheck = await fetch(`https://api.github.com/orgs/${owner}`, {
      headers: {
        Authorization: `Bearer ${secrets.githubToken}`,
        Accept: "application/vnd.github+json",
      },
    });
    const isOrg = orgCheck.ok;
    const listUrl = isOrg
      ? `https://api.github.com/orgs/${owner}/repos`
      : `https://api.github.com/user/repos`;

    while (true) {
      const resp = await fetch(
        `${listUrl}?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
        {
          headers: {
            Authorization: `Bearer ${secrets.githubToken}`,
            Accept: "application/vnd.github+json",
          },
        },
      );
      if (!resp.ok) {
        return res.status(502).json({
          error: `GitHub API error: ${resp.status} ${await resp.text()}`,
        });
      }
      const repos = await resp.json();
      if (!Array.isArray(repos) || repos.length === 0) break;
      allRepos.push(...repos);
      if (repos.length < 100) break;
      page++;
    }

    const now = new Date().toISOString();
    const batch = firestore.batch();
    for (const repo of allRepos) {
      const ref = githubReposCollection().doc(String(repo.id));
      batch.set(ref, {
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        description: repo.description || null,
        default_branch: repo.default_branch || "main",
        language: repo.language || null,
        archived: repo.archived || false,
        updated_at: repo.updated_at,
        discovered_at: now,
      });
    }
    await batch.commit();

    res.json({
      repos: allRepos.map((r) => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        private: r.private,
        description: r.description,
        default_branch: r.default_branch,
        language: r.language,
        archived: r.archived,
        updated_at: r.updated_at,
      })),
      total: allRepos.length,
      org: owner,
      discovered_at: now,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/github/repos", async (_req, res) => {
  try {
    const snapshot = await githubReposCollection().orderBy("name").get();
    const repos = snapshot.docs.map((doc) => doc.data());
    res.json({ repos, total: repos.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/github/assignments", async (req, res) => {
  try {
    const uid = req.query.uid;
    const repo = req.query.repo;
    let query = githubAssignmentsCollection().orderBy("created_at", "desc");
    if (uid)
      query = githubAssignmentsCollection().where("firebase_uid", "==", uid);
    if (repo)
      query = githubAssignmentsCollection().where("repo_full_name", "==", repo);
    const snapshot = await query.get();
    const assignments = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    res.json({ assignments, total: assignments.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/v1/github/access-scan", async (req, res) => {
  try {
    const githubHandle = String(req.query.github_handle || "").trim();
    if (!githubHandle) {
      return res
        .status(400)
        .json({ error: "github_handle query param is required." });
    }

    const secrets = await loadProviderSecrets();
    if (!secrets.githubToken) {
      return res.status(500).json({ error: "GitHub token not configured." });
    }

    const reposSnapshot = await githubReposCollection().get();
    const repos = reposSnapshot.docs
      .map((doc) => doc.data())
      .filter((repo) => repo?.full_name && !repo.archived);

    const accessible_repos = [];
    const errors = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < repos.length; i += BATCH_SIZE) {
      const batch = repos.slice(i, i + BATCH_SIZE);
      const checks = batch.map(async (repo) => {
        const [owner, repoName] = String(repo.full_name).split("/");
        if (!owner || !repoName) return;
        const permissionResp = await fetch(
          `https://api.github.com/repos/${owner}/${repoName}/collaborators/${encodeURIComponent(githubHandle)}/permission`,
          {
            headers: {
              Authorization: `Bearer ${secrets.githubToken}`,
              Accept: "application/vnd.github+json",
            },
          },
        );

        if (permissionResp.status === 404) {
          return;
        }
        if (!permissionResp.ok) {
          errors.push(
            `${repo.full_name}: ${permissionResp.status} ${await permissionResp.text()}`,
          );
          return;
        }

        const permissionData = await permissionResp.json();
        const permission =
          permissionData.role_name || permissionData.permission || "unknown";
        if (permission === "none") {
          return;
        }
        accessible_repos.push({
          repo_full_name: repo.full_name,
          permission,
        });
      });
      await Promise.all(checks);
    }

    accessible_repos.sort((a, b) =>
      a.repo_full_name.localeCompare(b.repo_full_name),
    );
    res.json({
      github_handle: githubHandle,
      scanned_total: repos.length,
      accessible_total: accessible_repos.length,
      accessible_repos,
      errors,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/github/assignments", async (req, res) => {
  try {
    const payload = req.body || {};
    if (
      !payload.firebase_uid ||
      !payload.github_handle ||
      !payload.repo_full_name ||
      !payload.role
    ) {
      return res.status(400).json({
        error:
          "firebase_uid, github_handle, repo_full_name, and role are required.",
      });
    }
    if (!GITHUB_ROLES.includes(payload.role)) {
      return res
        .status(400)
        .json({ error: `role must be one of: ${GITHUB_ROLES.join(", ")}` });
    }

    const secrets = await loadProviderSecrets();
    if (!secrets.githubToken) {
      return res.status(500).json({ error: "GitHub token not configured." });
    }

    const [owner, repo] = payload.repo_full_name.split("/");
    const ghResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/collaborators/${encodeURIComponent(payload.github_handle)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${secrets.githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ permission: payload.role }),
      },
    );
    if (!ghResp.ok && ghResp.status !== 204) {
      const body = await ghResp.text();
      return res.status(502).json({
        error: `GitHub collaborator add failed: ${ghResp.status} ${body}`,
      });
    }

    const now = new Date().toISOString();
    const existing = await githubAssignmentsCollection()
      .where("firebase_uid", "==", payload.firebase_uid)
      .where("repo_full_name", "==", payload.repo_full_name)
      .limit(1)
      .get();

    if (!existing.empty) {
      const doc = existing.docs[0];
      await doc.ref.set(
        {
          role: payload.role,
          github_handle: payload.github_handle,
          updated_at: now,
        },
        { merge: true },
      );
      const updated = await doc.ref.get();
      await writeAuditEntry({
        action: "github.repo_access_updated",
        firebase_uid: payload.firebase_uid,
        subject_id: payload.repo_full_name,
        role: payload.role,
        actor: payload.granted_by || "admin",
      });
      return res.json({ assignment: { id: updated.id, ...updated.data() } });
    }

    const docRef = await githubAssignmentsCollection().add({
      firebase_uid: payload.firebase_uid,
      github_handle: payload.github_handle,
      repo_full_name: payload.repo_full_name,
      role: payload.role,
      granted_by: payload.granted_by || "admin",
      created_at: now,
      updated_at: now,
    });
    const created = await docRef.get();
    await writeAuditEntry({
      action: "github.repo_access_granted",
      firebase_uid: payload.firebase_uid,
      subject_id: payload.repo_full_name,
      role: payload.role,
      actor: payload.granted_by || "admin",
    });
    res.status(201).json({ assignment: { id: created.id, ...created.data() } });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete("/api/v1/github/assignments/:id", async (req, res) => {
  try {
    const ref = githubAssignmentsCollection().doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Assignment not found." });
    }
    const data = doc.data();
    const secrets = await loadProviderSecrets();
    if (secrets.githubToken && data.repo_full_name && data.github_handle) {
      const [owner, repo] = data.repo_full_name.split("/");
      await fetch(
        `https://api.github.com/repos/${owner}/${repo}/collaborators/${encodeURIComponent(data.github_handle)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${secrets.githubToken}`,
            Accept: "application/vnd.github+json",
          },
        },
      );
    }
    await ref.delete();
    await writeAuditEntry({
      action: "github.repo_access_revoked",
      firebase_uid: data.firebase_uid,
      subject_id: data.repo_full_name,
      role: data.role,
      actor: "admin",
    });
    res.json({ revoked: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ---------------------------------------------------------------------------
// Application self-registration
// ---------------------------------------------------------------------------

app.post("/api/v1/apps/register", async (req, res) => {
  try {
    const actor = await getActorFromRequest(req);
    if (!actor) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!(await isPlatformAdmin(actor.uid))) {
      return res.status(403).json({ error: "Only admins can register applications." });
    }

    const payload = req.body || {};
    if (!payload.app_id || !payload.name) {
      return res.status(400).json({ error: "app_id and name are required." });
    }

    const now = new Date().toISOString();
    const appDoc = {
      app_id: payload.app_id,
      name: payload.name,
      repo: payload.repo || "",
      category: payload.category || "ui",
      auth_mode: payload.auth_mode || "firebase_shared",
      environments: payload.environments || ["dev", "staging", "prod"],
      owner_team: payload.owner_team || "platform-engineering",
      status: "active",
      created_at: now,
      updated_at: now,
    };
    await applicationsCollection().doc(payload.app_id).set(appDoc, { merge: true });

    if (Array.isArray(payload.capabilities)) {
      await appCapabilitiesCollection().doc(payload.app_id).set({
        app_id: payload.app_id,
        capabilities: payload.capabilities,
        role_presets: payload.role_presets || { viewer: [], editor: [], admin: ["*"], owner: ["*"] },
        updated_at: now,
      });
    }

    await writeAuditEntry({ action: "app.registered", app_id: payload.app_id, actor: actor.uid });
    res.status(201).json({ application: appDoc });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

app.get("/api/v1/notification-preferences", async (req, res) => {
  try {
    const actor = await getActorFromRequest(req);
    if (!actor || !(await isPlatformAdmin(actor.uid))) {
      return res.status(403).json({ error: "Admin access required." });
    }
    const snapshot = await notificationPreferencesCollection().orderBy("created_at", "desc").get();
    const prefs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ preferences: prefs, total: prefs.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/v1/notification-preferences", async (req, res) => {
  try {
    const actor = await getActorFromRequest(req);
    if (!actor || !(await isPlatformAdmin(actor.uid))) {
      return res.status(403).json({ error: "Admin access required." });
    }
    const payload = req.body || {};
    if (!payload.event_type || !payload.recipient_email) {
      return res.status(400).json({ error: "event_type and recipient_email are required." });
    }
    const now = new Date().toISOString();
    const docRef = await notificationPreferencesCollection().add({
      event_type: payload.event_type,
      recipient_uid: payload.recipient_uid || null,
      recipient_email: payload.recipient_email,
      recipient_name: payload.recipient_name || "",
      enabled: payload.enabled !== false,
      created_at: now,
      updated_at: now,
    });
    const created = await docRef.get();
    res.status(201).json({ preference: { id: created.id, ...created.data() } });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.put("/api/v1/notification-preferences/:id", async (req, res) => {
  try {
    const actor = await getActorFromRequest(req);
    if (!actor || !(await isPlatformAdmin(actor.uid))) {
      return res.status(403).json({ error: "Admin access required." });
    }
    const ref = notificationPreferencesCollection().doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Preference not found." });
    }
    const updates = {};
    if (req.body?.enabled !== undefined) updates.enabled = req.body.enabled;
    if (req.body?.event_type) updates.event_type = req.body.event_type;
    if (req.body?.recipient_email) updates.recipient_email = req.body.recipient_email;
    if (req.body?.recipient_name !== undefined) updates.recipient_name = req.body.recipient_name;
    updates.updated_at = new Date().toISOString();
    await ref.set(updates, { merge: true });
    const updated = await ref.get();
    res.json({ preference: { id: updated.id, ...updated.data() } });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete("/api/v1/notification-preferences/:id", async (req, res) => {
  try {
    const actor = await getActorFromRequest(req);
    if (!actor || !(await isPlatformAdmin(actor.uid))) {
      return res.status(403).json({ error: "Admin access required." });
    }
    const ref = notificationPreferencesCollection().doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Preference not found." });
    }
    await ref.delete();
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`real user-management API listening on :${PORT}`);
});
