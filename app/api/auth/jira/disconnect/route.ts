import { NextResponse } from "next/server";
import { disconnectJira } from "@/lib/jira-oauth";

export async function POST() {
  await disconnectJira();
  return NextResponse.json({ ok: true });
}
