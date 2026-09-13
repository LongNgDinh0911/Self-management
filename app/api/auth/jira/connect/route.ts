import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getAuthorizeUrl, popupResultHtml } from "@/lib/jira-oauth";

export async function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get("returnTo") || "/";
  const popup = request.nextUrl.searchParams.get("popup") === "1";
  const state = randomBytes(16).toString("hex");

  let authorizeUrl: string;
  try {
    authorizeUrl = getAuthorizeUrl(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không tạo được URL kết nối Jira";
    if (popup) {
      return new NextResponse(popupResultHtml(false, message), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return NextResponse.redirect(
      new URL(`${returnTo}?jiraError=${encodeURIComponent(message)}`, request.url)
    );
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("jira_oauth_state", JSON.stringify({ state, returnTo, popup }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
