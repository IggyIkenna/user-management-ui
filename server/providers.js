import { GoogleAuth } from "google-auth-library";
import {
  IAMClient,
  CreateUserCommand,
  PutUserPolicyCommand,
  DeleteUserPolicyCommand,
  DeleteUserCommand,
} from "@aws-sdk/client-iam";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { loadProviderSecrets } from "./secret-manager.js";

const googleAuth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

function roleNeedsGithub(role) {
  return role === "admin" || role === "collaborator";
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

function roleNeedsCloud(role) {
  return role === "admin" || role === "collaborator";
}

function getTemplate(profile) {
  return (
    profile.access_template || {
      aws_permission_sets: [],
      slack_channels: [],
      github_teams: [],
    }
  );
}

function ok(service, label, message) {
  return { service, label, status: "success", message };
}

function fail(service, label, message) {
  return { service, label, status: "failed", message };
}

function na(service, label, message) {
  return {
    service,
    label,
    status: "success",
    message: message || "not applicable",
  };
}

function buildAwsClientConfig(secrets) {
  const config = {
    region: process.env.AWS_REGION || "us-east-1",
  };
  if (secrets.awsAccessKeyId && secrets.awsSecretAccessKey) {
    config.credentials = {
      accessKeyId: secrets.awsAccessKeyId,
      secretAccessKey: secrets.awsSecretAccessKey,
      sessionToken: secrets.awsSessionToken || undefined,
    };
  }
  return config;
}

function isAwsBreakglassEnabled() {
  const raw =
    process.env.AWS_BREAKGLASS_ENABLED ??
    (process.env.NODE_ENV === "production" ? "false" : "true");
  return String(raw) === "true";
}

async function resolveGcpProjectId() {
  if (process.env.GCP_TARGET_PROJECT_ID)
    return process.env.GCP_TARGET_PROJECT_ID;
  if (process.env.GOOGLE_CLOUD_PROJECT_ID)
    return process.env.GOOGLE_CLOUD_PROJECT_ID;
  try {
    return await googleAuth.getProjectId();
  } catch {
    return "";
  }
}

async function provisionGitHub(profile, secrets) {
  const template = getTemplate(profile);
  const needsGitHub =
    roleNeedsGithub(profile.role) || template.github_teams.length > 0;
  if (!needsGitHub) {
    return na("github", "GitHub");
  }
  if (!secrets.githubToken) {
    return fail("github", "GitHub", "Missing GitHub admin token.");
  }
  const org = process.env.GITHUB_ORG || "IggyIkenna";
  const res = await fetch(`https://api.github.com/orgs/${org}/invitations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secrets.githubToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: profile.email,
      role: process.env.GITHUB_INVITE_ROLE || "direct_member",
    }),
  });
  if (!res.ok && res.status !== 422) {
    const body = await res.text();
    return fail("github", "GitHub", `GitHub invite failed: ${body}`);
  }
  if (template.github_teams.length > 0) {
    if (!profile.github_handle) {
      return fail(
        "github",
        "GitHub",
        "Template requires GitHub team mapping but github_handle is missing.",
      );
    }
    for (const teamSlug of template.github_teams) {
      const teamRes = await fetch(
        `https://api.github.com/orgs/${org}/teams/${encodeURIComponent(teamSlug)}/memberships/${encodeURIComponent(profile.github_handle)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${secrets.githubToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: "member" }),
        },
      );
      if (!teamRes.ok && teamRes.status !== 404) {
        return fail(
          "github",
          "GitHub",
          `GitHub team assignment failed for ${teamSlug}: ${await teamRes.text()}`,
        );
      }
    }
  }
  return ok("github", "GitHub", "GitHub org/team mappings processed.");
}

async function provisionSlack(profile, secrets) {
  const template = getTemplate(profile);
  const needsSlack =
    roleNeedsSlack(profile.role) || template.slack_channels.length > 0;
  if (!needsSlack) {
    return na("slack", "Slack");
  }
  if (!secrets.slackScimToken) {
    return fail(
      "slack",
      "Slack",
      "Missing Slack SCIM token (set SLACK_SCIM_TOKEN or SECRET_REF_SLACK_SCIM_TOKEN).",
    );
  }
  const scimHeaders = {
    Authorization: `Bearer ${secrets.slackScimToken}`,
    "Content-Type": "application/json",
  };
  const filter = encodeURIComponent(`email eq "${profile.email}"`);
  const lookupRes = await fetch(
    `https://api.slack.com/scim/v1/Users?filter=${filter}`,
    {
      method: "GET",
      headers: scimHeaders,
    },
  );
  if (!lookupRes.ok) {
    return fail(
      "slack",
      "Slack",
      `Slack SCIM lookup failed: ${await lookupRes.text()}`,
    );
  }
  const lookupBody = await lookupRes.json();
  const existingUser =
    Array.isArray(lookupBody?.Resources) && lookupBody.Resources.length > 0
      ? lookupBody.Resources[0]
      : null;
  if (!existingUser) {
    const createPayload = {
      userName: profile.email,
      displayName: profile.name,
      active: true,
      emails: [{ value: profile.email, primary: true }],
      name: {
        formatted: profile.name,
      },
    };
    const createRes = await fetch("https://api.slack.com/scim/v1/Users", {
      method: "POST",
      headers: scimHeaders,
      body: JSON.stringify(createPayload),
    });
    if (!createRes.ok) {
      return fail(
        "slack",
        "Slack",
        `Slack SCIM create failed: ${await createRes.text()}`,
      );
    }
  } else if (!existingUser.active) {
    const patchRes = await fetch(
      `https://api.slack.com/scim/v1/Users/${existingUser.id}`,
      {
        method: "PATCH",
        headers: scimHeaders,
        body: JSON.stringify({
          Operations: [
            {
              op: "Replace",
              path: "active",
              value: true,
            },
          ],
        }),
      },
    );
    if (!patchRes.ok) {
      return fail(
        "slack",
        "Slack",
        `Slack SCIM activate failed: ${await patchRes.text()}`,
      );
    }
  }
  if (template.slack_channels.length > 0) {
    if (!secrets.slackBotToken) {
      return fail(
        "slack",
        "Slack",
        "Slack channels requested but SLACK_BOT_TOKEN/SECRET_REF_SLACK_BOT_TOKEN is missing.",
      );
    }
    const lookup = await fetch("https://slack.com/api/users.lookupByEmail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secrets.slackBotToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ email: profile.email }),
    });
    const lookupData = await lookup.json();
    if (!lookupData.ok || !lookupData.user?.id) {
      return fail(
        "slack",
        "Slack",
        "Template requires Slack channel mapping but user lookup failed.",
      );
    }
    for (const channelId of template.slack_channels) {
      const invite = await fetch("https://slack.com/api/conversations.invite", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secrets.slackBotToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          channel: channelId,
          users: lookupData.user.id,
        }),
      });
      const inviteData = await invite.json();
      if (!inviteData.ok && inviteData.error !== "already_in_channel") {
        return fail(
          "slack",
          "Slack",
          `Slack channel mapping failed for ${channelId}: ${inviteData.error}`,
        );
      }
    }
  }
  return ok(
    "slack",
    "Slack",
    "Slack user onboarded via SCIM and channel mappings processed.",
  );
}

async function getMicrosoftGraphToken(secrets) {
  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  if (!tenantId || !clientId || !secrets.msClientSecret) return null;
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: secrets.msClientSecret,
    scope: process.env.MS_GRAPH_SCOPE || "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(tokenUrl, { method: "POST", body });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

async function provisionM365(profile, secrets) {
  if (!roleNeedsM365(profile.role)) {
    return na("microsoft365", "Microsoft 365");
  }
  const token = await getMicrosoftGraphToken(secrets);
  if (!token) {
    return fail(
      "microsoft365",
      "Microsoft 365",
      "Missing Microsoft Graph token.",
    );
  }
  const domain = process.env.MS_DEFAULT_DOMAIN || "odum-research.com";
  const localPart =
    String(profile.email || "").split("@")[0] || profile.firebase_uid;
  const upn = `${localPart}@${domain}`;
  const payload = {
    accountEnabled: true,
    displayName: profile.name,
    mailNickname: localPart,
    userPrincipalName: upn,
    passwordProfile: {
      forceChangePasswordNextSignIn: true,
      password: process.env.MS_TEMP_PASSWORD || "TempPass#2026!",
    },
  };
  const res = await fetch("https://graph.microsoft.com/v1.0/users", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok && res.status !== 409) {
    const body = await res.text();
    return fail(
      "microsoft365",
      "Microsoft 365",
      `Graph user create failed: ${body}`,
    );
  }
  return ok(
    "microsoft365",
    "Microsoft 365",
    "M365 user create/update processed.",
  );
}

async function provisionGcp(profile) {
  if (!roleNeedsCloud(profile.role)) {
    return na("gcp", "GCP IAM");
  }
  const projectId = await resolveGcpProjectId();
  if (!projectId) {
    return fail(
      "gcp",
      "GCP IAM",
      "Missing GCP project target. Set GCP_TARGET_PROJECT_ID or GOOGLE_CLOUD_PROJECT_ID.",
    );
  }
  const member = `user:${profile.gcp_email || profile.email}`;
  const role = profile.role === "admin" ? "roles/editor" : "roles/viewer";
  const client = await googleAuth.getClient();
  const policyUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`;
  const policyRes = await client.request({
    url: policyUrl,
    method: "POST",
    data: {},
  });
  const policy = policyRes.data || {};
  const bindings = policy.bindings || [];
  const existing = bindings.find((b) => b.role === role);
  if (existing) {
    if (!existing.members.includes(member)) existing.members.push(member);
  } else {
    bindings.push({ role, members: [member] });
  }
  await client.request({
    url: `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:setIamPolicy`,
    method: "POST",
    data: { policy: { ...policy, bindings } },
  });
  return ok("gcp", "GCP IAM", "GCP IAM binding upserted.");
}

async function provisionAws(profile, secrets) {
  const template = getTemplate(profile);
  const needsAws =
    roleNeedsCloud(profile.role) || template.aws_permission_sets.length > 0;
  if (!needsAws) {
    return na("aws", "AWS IAM");
  }
  const breakglass = isAwsBreakglassEnabled();
  if (!breakglass) {
    return ok(
      "aws",
      "AWS IAM",
      `AWS breakglass disabled; set AWS_BREAKGLASS_ENABLED=true for native IAM provisioning (template sets: ${template.aws_permission_sets.join(", ") || "none"}).`,
    );
  }

  const iamClient = new IAMClient(buildAwsClientConfig(secrets));
  const userName = `${process.env.AWS_NATIVE_IAM_USER_PREFIX || "um-"}${profile.firebase_uid}`;
  try {
    await iamClient.send(
      new CreateUserCommand({
        UserName: userName,
        Path: process.env.AWS_NATIVE_IAM_USER_PATH || "/odum/user-management/",
      }),
    );
  } catch (error) {
    if (!String(error).includes("EntityAlreadyExists")) {
      return fail("aws", "AWS IAM", `CreateUser failed: ${String(error)}`);
    }
  }
  const templatePolicyMap = (() => {
    try {
      return JSON.parse(process.env.AWS_TEMPLATE_POLICY_MAP_JSON || "{}");
    } catch {
      return {};
    }
  })();
  const mappedActions = template.aws_permission_sets.flatMap(
    (setName) => templatePolicyMap[setName] || [],
  );
  const defaultActions =
    profile.role === "admin" ? ["*"] : ["ec2:Describe*", "s3:ListAllMyBuckets"];
  const policyActions =
    mappedActions.length > 0 ? mappedActions : defaultActions;
  const policyDoc = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: policyActions,
        Resource: "*",
      },
    ],
  };
  await iamClient.send(
    new PutUserPolicyCommand({
      UserName: userName,
      PolicyName: "UserManagementInlinePolicy",
      PolicyDocument: JSON.stringify(policyDoc),
    }),
  );
  return ok(
    "aws",
    "AWS IAM",
    `AWS breakglass IAM user provisioned with template mappings (${template.aws_permission_sets.join(", ") || "default"}).`,
  );
}

async function provisionPortal(profile, secrets) {
  if (!secrets.portalToken || !process.env.PORTAL_API_BASE_URL) {
    return ok("portal", "Portal", "Portal token/API not set; skipped.");
  }
  const res = await fetch(
    `${process.env.PORTAL_API_BASE_URL}/users/provision`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secrets.portalToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uid: profile.firebase_uid,
        email: profile.email,
        role: profile.role,
        product_slugs: profile.product_slugs || [],
        status: "active",
      }),
    },
  );
  if (!res.ok && res.status !== 409) {
    return fail(
      "portal",
      "Portal",
      `Portal provisioning failed: ${await res.text()}`,
    );
  }
  return ok("portal", "Portal", "Portal provisioning processed.");
}

async function deprovisionGitHub(profile, secrets) {
  const template = getTemplate(profile);
  if (!profile.github_handle || !secrets.githubToken) {
    return na("github", "GitHub", "GitHub handle or token missing; skipped.");
  }
  const org = process.env.GITHUB_ORG || "IggyIkenna";
  for (const teamSlug of template.github_teams || []) {
    const teamRes = await fetch(
      `https://api.github.com/orgs/${org}/teams/${encodeURIComponent(teamSlug)}/memberships/${encodeURIComponent(profile.github_handle)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${secrets.githubToken}`,
          Accept: "application/vnd.github+json",
        },
      },
    );
    if (!teamRes.ok && teamRes.status !== 404) {
      return fail(
        "github",
        "GitHub",
        `GitHub team removal failed for ${teamSlug}: ${await teamRes.text()}`,
      );
    }
  }
  const res = await fetch(
    `https://api.github.com/orgs/${org}/memberships/${profile.github_handle}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${secrets.githubToken}`,
        Accept: "application/vnd.github+json",
      },
    },
  );
  if (!res.ok && res.status !== 404) {
    return fail(
      "github",
      "GitHub",
      `GitHub deprovision failed: ${await res.text()}`,
    );
  }
  return ok("github", "GitHub", "GitHub membership removed/deactivated.");
}

async function deprovisionSlack(profile, secrets) {
  const template = getTemplate(profile);
  if (!secrets.slackScimToken) {
    return fail(
      "slack",
      "Slack",
      "Missing Slack SCIM token (set SLACK_SCIM_TOKEN or SECRET_REF_SLACK_SCIM_TOKEN).",
    );
  }
  const scimHeaders = {
    Authorization: `Bearer ${secrets.slackScimToken}`,
    "Content-Type": "application/json",
  };
  const filter = encodeURIComponent(`email eq "${profile.email}"`);
  const lookupRes = await fetch(
    `https://api.slack.com/scim/v1/Users?filter=${filter}`,
    {
      method: "GET",
      headers: scimHeaders,
    },
  );
  if (!lookupRes.ok) {
    return fail(
      "slack",
      "Slack",
      `Slack SCIM lookup failed: ${await lookupRes.text()}`,
    );
  }
  const lookupBody = await lookupRes.json();
  const existingUser =
    Array.isArray(lookupBody?.Resources) && lookupBody.Resources.length > 0
      ? lookupBody.Resources[0]
      : null;
  if (!existingUser) {
    return na("slack", "Slack", "Slack user not found.");
  }
  if (template.slack_channels.length > 0 && secrets.slackBotToken) {
    const lookup = await fetch("https://slack.com/api/users.lookupByEmail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secrets.slackBotToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ email: profile.email }),
    });
    const data = await lookup.json();
    if (data.ok && data.user?.id) {
      for (const channelId of template.slack_channels || []) {
        const kick = await fetch("https://slack.com/api/conversations.kick", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secrets.slackBotToken}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ channel: channelId, user: data.user.id }),
        });
        const kickResult = await kick.json();
        if (
          !kickResult.ok &&
          kickResult.error !== "not_in_channel" &&
          kickResult.error !== "channel_not_found"
        ) {
          return fail(
            "slack",
            "Slack",
            `Slack channel removal failed for ${channelId}: ${kickResult.error}`,
          );
        }
      }
    }
  }
  const deactivate = await fetch(
    `https://api.slack.com/scim/v1/Users/${existingUser.id}`,
    {
      method: "PATCH",
      headers: scimHeaders,
      body: JSON.stringify({
        Operations: [
          {
            op: "Replace",
            path: "active",
            value: false,
          },
        ],
      }),
    },
  );
  if (!deactivate.ok) {
    return fail(
      "slack",
      "Slack",
      `Slack deprovision failed: ${await deactivate.text()}`,
    );
  }
  return ok("slack", "Slack", "Slack account deactivated via SCIM.");
}

async function deprovisionM365(profile, secrets) {
  if (!roleNeedsM365(profile.role)) {
    return na("microsoft365", "Microsoft 365");
  }
  const token = await getMicrosoftGraphToken(secrets);
  if (!token) {
    return fail(
      "microsoft365",
      "Microsoft 365",
      "Missing Microsoft Graph token.",
    );
  }
  const upn = profile.microsoft_upn || profile.email;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accountEnabled: false }),
    },
  );
  if (!res.ok && res.status !== 404) {
    return fail(
      "microsoft365",
      "Microsoft 365",
      `Graph deprovision failed: ${await res.text()}`,
    );
  }
  return ok("microsoft365", "Microsoft 365", "M365 account disabled.");
}

async function deprovisionGcp(profile) {
  if (!roleNeedsCloud(profile.role)) {
    return na("gcp", "GCP IAM");
  }
  const projectId = await resolveGcpProjectId();
  if (!projectId) {
    return fail(
      "gcp",
      "GCP IAM",
      "Missing GCP project target. Set GCP_TARGET_PROJECT_ID or GOOGLE_CLOUD_PROJECT_ID.",
    );
  }
  const member = `user:${profile.gcp_email || profile.email}`;
  const client = await googleAuth.getClient();
  const policyRes = await client.request({
    url: `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`,
    method: "POST",
    data: {},
  });
  const policy = policyRes.data || {};
  const bindings = (policy.bindings || []).map((b) => ({
    ...b,
    members: (b.members || []).filter((m) => m !== member),
  }));
  await client.request({
    url: `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:setIamPolicy`,
    method: "POST",
    data: { policy: { ...policy, bindings } },
  });
  return ok("gcp", "GCP IAM", "GCP IAM bindings removed.");
}

async function deprovisionAws(profile, secrets) {
  const breakglass = isAwsBreakglassEnabled();
  if (!breakglass) {
    return ok(
      "aws",
      "AWS IAM",
      "Breakglass disabled; IAM Identity Center deprovision via workflow.",
    );
  }
  const iamClient = new IAMClient(buildAwsClientConfig(secrets));
  const userName = `${process.env.AWS_NATIVE_IAM_USER_PREFIX || "um-"}${profile.firebase_uid}`;
  try {
    await iamClient.send(
      new DeleteUserPolicyCommand({
        UserName: userName,
        PolicyName: "UserManagementInlinePolicy",
      }),
    );
  } catch {}
  try {
    await iamClient.send(new DeleteUserCommand({ UserName: userName }));
  } catch (error) {
    if (!String(error).includes("NoSuchEntity")) {
      return fail("aws", "AWS IAM", `AWS delete user failed: ${String(error)}`);
    }
  }
  return ok("aws", "AWS IAM", "AWS breakglass user deleted.");
}

async function deprovisionPortal(profile, secrets) {
  if (!secrets.portalToken || !process.env.PORTAL_API_BASE_URL) {
    return ok("portal", "Portal", "Portal token/API not set; skipped.");
  }
  const res = await fetch(`${process.env.PORTAL_API_BASE_URL}/users/offboard`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secrets.portalToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uid: profile.firebase_uid,
      status: "offboarded",
    }),
  });
  if (!res.ok && res.status !== 404) {
    return fail(
      "portal",
      "Portal",
      `Portal offboard failed: ${await res.text()}`,
    );
  }
  return ok("portal", "Portal", "Portal access revoked.");
}

export async function runProviderProvisioning(profile) {
  const secrets = await loadProviderSecrets();
  const steps = [];
  for (const runner of [
    provisionGitHub,
    provisionSlack,
    provisionM365,
    provisionGcp,
    provisionAws,
    provisionPortal,
  ]) {
    try {
      steps.push(await runner(profile, secrets));
    } catch (error) {
      const fallbackService =
        runner.name.includes("Github") || runner.name.includes("GitHub")
          ? "github"
          : runner.name.includes("Slack")
            ? "slack"
            : runner.name.includes("M365")
              ? "microsoft365"
              : runner.name.includes("Gcp")
                ? "gcp"
                : runner.name.includes("Aws")
                  ? "aws"
                  : "portal";
      steps.push(
        fail(fallbackService, fallbackService.toUpperCase(), String(error)),
      );
    }
  }
  return steps;
}

export async function runProviderDeprovisioning(profile) {
  const secrets = await loadProviderSecrets();
  const steps = [];
  for (const runner of [
    deprovisionGitHub,
    deprovisionSlack,
    deprovisionM365,
    deprovisionGcp,
    deprovisionAws,
    deprovisionPortal,
  ]) {
    try {
      steps.push(await runner(profile, secrets));
    } catch (error) {
      steps.push(fail("portal", "DEPROVISION", String(error)));
    }
  }
  return steps;
}

export async function runProviderHealthChecks() {
  const secrets = await loadProviderSecrets();
  const checks = [];

  const pushCheck = (provider, okValue, message, details) => {
    checks.push({
      provider,
      ok: okValue,
      message,
      details: details || null,
      checked_at: new Date().toISOString(),
    });
  };

  // GitHub
  try {
    if (!secrets.githubToken) {
      pushCheck("github", false, "Missing GitHub token.");
    } else {
      const res = await fetch("https://api.github.com/rate_limit", {
        headers: { Authorization: `Bearer ${secrets.githubToken}` },
      });
      pushCheck(
        "github",
        res.ok,
        res.ok ? "GitHub reachable." : await res.text(),
      );
    }
  } catch (error) {
    pushCheck("github", false, String(error));
  }

  // Slack
  try {
    if (!secrets.slackScimToken) {
      pushCheck("slack", false, "Missing Slack SCIM token.");
    } else {
      const res = await fetch("https://api.slack.com/scim/v1/Users?count=1", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secrets.slackScimToken}`,
          "Content-Type": "application/json",
        },
      });
      pushCheck(
        "slack",
        res.ok,
        res.ok
          ? "Slack SCIM reachable."
          : `Slack SCIM health check failed: ${await res.text()}`,
      );
    }
    if (!secrets.slackBotToken) {
      pushCheck(
        "slack-bot",
        false,
        "Missing Slack bot token (required for channel invite/removal).",
      );
    } else {
      const botAuthRes = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secrets.slackBotToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      const botAuthData = await botAuthRes.json();
      pushCheck(
        "slack-bot",
        Boolean(botAuthData.ok),
        botAuthData.ok ? "Slack bot token reachable." : botAuthData.error,
      );
    }
  } catch (error) {
    pushCheck("slack", false, String(error));
  }

  // Microsoft 365
  try {
    const token = await getMicrosoftGraphToken(secrets);
    pushCheck(
      "microsoft365",
      Boolean(token),
      token ? "Graph token acquired." : "Failed to acquire Graph token.",
    );
  } catch (error) {
    pushCheck("microsoft365", false, String(error));
  }

  // GCP IAM
  try {
    const projectId = await resolveGcpProjectId();
    if (!projectId) {
      pushCheck(
        "gcp",
        false,
        "Missing GCP project target. Set GCP_TARGET_PROJECT_ID or GOOGLE_CLOUD_PROJECT_ID.",
      );
    } else {
      const client = await googleAuth.getClient();
      const res = await client.request({
        url: `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`,
        method: "GET",
      });
      pushCheck("gcp", Boolean(res.data?.projectId), "GCP project reachable.");
    }
  } catch (error) {
    pushCheck("gcp", false, String(error));
  }

  // AWS
  try {
    const stsClient = new STSClient(buildAwsClientConfig(secrets));
    const identity = await stsClient.send(new GetCallerIdentityCommand({}));
    pushCheck("aws", true, "AWS STS reachable.", identity);
  } catch (error) {
    pushCheck(
      "aws",
      false,
      `AWS auth failed. Ensure CLI/SSO is logged in or set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY. ${String(error)}`,
    );
  }

  return checks;
}
