import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/session";

export async function POST(request: NextRequest) {
  const { pin } = await request.json();
  const appPin = process.env.APP_PIN;

  if (!appPin) {
    return NextResponse.json({ error: "APP_PIN chưa được cấu hình" }, { status: 500 });
  }

  if (typeof pin !== "string" || pin !== appPin) {
    return NextResponse.json({ error: "PIN không đúng" }, { status: 401 });
  }

  const token = await createSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
