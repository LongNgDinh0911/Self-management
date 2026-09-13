import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForToken,
  fetchAccessibleResources,
  popupResultHtml,
  saveConnection,
} from "@/lib/jira-oauth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieRaw = request.cookies.get("jira_oauth_state")?.value;

  let returnTo = "/";
  let popup = false;
  try {
    if (cookieRaw) {
      const parsed = JSON.parse(cookieRaw);
      returnTo = parsed.returnTo || "/";
      popup = !!parsed.popup;
    }
  } catch {
    // ignore malformed cookie, fall back to defaults
  }

  function fail(message: string) {
    const res = popup
      ? new NextResponse(popupResultHtml(false, message), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
      : NextResponse.redirect(new URL(`${returnTo}?jiraError=${encodeURIComponent(message)}`, request.url));
    res.cookies.delete("jira_oauth_state");
    return res;
  }

  if (!code || !state) return fail("Thiếu code/state từ Atlassian");

  let savedState = "";
  try {
    savedState = cookieRaw ? JSON.parse(cookieRaw).state : "";
  } catch {
    // ignore
  }
  if (!savedState || savedState !== state) return fail("State không khớp — thử kết nối lại");

  try {
    const token = await exchangeCodeForToken(code);
    const resources = await fetchAccessibleResources(token.access_token);
    if (resources.length === 0) {
      return fail("Tài khoản này không có quyền truy cập site Jira nào");
    }
    await saveConnection(token, resources);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kết nối Jira thất bại";
    return fail(message);
  }

  const res = popup
    ? new NextResponse(popupResultHtml(true), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    : NextResponse.redirect(new URL(`${returnTo}?jiraConnected=1`, request.url));
  res.cookies.delete("jira_oauth_state");
  return res;
}
