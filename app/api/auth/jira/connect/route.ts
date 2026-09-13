import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getAuthorizeUrl } from "@/lib/jira-oauth";

export async function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get("returnTo") || "/";
  const state = randomBytes(16).toString("hex");

  let authorizeUrl: string;
  try {
    authorizeUrl = getAuthorizeUrl(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không tạo được URL kết nối Jira";
    return NextResponse.redirect(
      new URL(`${returnTo}?jiraError=${encodeURIComponent(message)}`, request.url)
    );
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("jira_oauth_state", JSON.stringify({ state, returnTo }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
