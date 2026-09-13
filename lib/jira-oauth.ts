import { prisma } from "@/lib/prisma";

const AUTHORIZE_URL = "https://auth.atlassian.com/authorize";
const TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const ACCESSIBLE_RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources";
const SCOPE = "read:jira-work offline_access";

export type JiraResource = { id: string; url: string; name: string };

function getEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} chưa được cấu hình trong .env`);
  return value;
}

function getRedirectUri() {
  const base = process.env.APP_BASE_URL || "http://localhost:3000";
  return `${base}/api/auth/jira/callback`;
}

export function getAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: getEnv("JIRA_OAUTH_CLIENT_ID"),
    scope: SCOPE,
    redirect_uri: getRedirectUri(),
    state,
    response_type: "code",
    prompt: "consent",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: getEnv("JIRA_OAUTH_CLIENT_ID"),
      client_secret: getEnv("JIRA_OAUTH_CLIENT_SECRET"),
      code,
      redirect_uri: getRedirectUri(),
    }),
  });
  if (!res.ok) throw new Error(`Đổi code lấy token thất bại (${res.status})`);
  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: getEnv("JIRA_OAUTH_CLIENT_ID"),
      client_secret: getEnv("JIRA_OAUTH_CLIENT_SECRET"),
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Làm mới token thất bại (${res.status})`);
  return res.json();
}

export async function fetchAccessibleResources(accessToken: string): Promise<JiraResource[]> {
  const res = await fetch(ACCESSIBLE_RESOURCES_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Không lấy được danh sách site (${res.status})`);
  return res.json();
}

export async function saveConnection(token: TokenResponse, resources: JiraResource[]) {
  await prisma.jiraConnection.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      resources: JSON.stringify(resources),
    },
    update: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      resources: JSON.stringify(resources),
    },
  });
}

export async function disconnectJira() {
  await prisma.jiraConnection.deleteMany({ where: { id: "default" } });
}

export async function getConnectionStatus() {
  const conn = await prisma.jiraConnection.findUnique({ where: { id: "default" } });
  if (!conn) return null;
  const resources = JSON.parse(conn.resources) as JiraResource[];
  return { resources, connectedAt: conn.createdAt };
}

/** Returns a valid access token + resolved cloudId for the given site, refreshing if needed. */
export async function getValidAccessToken(
  jiraSite?: string | null
): Promise<{ accessToken: string; cloudId: string } | { error: string }> {
  const conn = await prisma.jiraConnection.findUnique({ where: { id: "default" } });
  if (!conn) return { error: "Chưa kết nối tài khoản Jira — vào Project Settings để kết nối" };

  let accessToken = conn.accessToken;
  let resources = JSON.parse(conn.resources) as JiraResource[];

  // refresh 1 minute before actual expiry
  if (conn.expiresAt.getTime() - 60_000 < Date.now()) {
    try {
      const refreshed = await refreshAccessToken(conn.refreshToken);
      resources = await fetchAccessibleResources(refreshed.access_token);
      await saveConnection(refreshed, resources);
      accessToken = refreshed.access_token;
    } catch {
      return { error: "Token Jira đã hết hạn và không làm mới được — kết nối lại trong Settings" };
    }
  }

  const cloudId = resolveCloudId(resources, jiraSite);
  if (!cloudId) return { error: "Tài khoản Jira đã kết nối không có quyền truy cập site này" };

  return { accessToken, cloudId };
}

export function resolveCloudId(resources: JiraResource[], jiraSite?: string | null): string | null {
  if (resources.length === 0) return null;
  if (jiraSite) {
    const match = resources.find((r) => {
      try {
        return new URL(r.url).host === jiraSite;
      } catch {
        return false;
      }
    });
    if (match) return match.id;
  }
  return resources[0].id;
}
