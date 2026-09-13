import { NextRequest, NextResponse } from "next/server";
import { adfToPlainText, mapJiraPriority, mapJiraStatus, mapJiraType } from "@/lib/jira";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const jiraSite = typeof body.jiraSite === "string" ? body.jiraSite.trim() : "";
  const jiraKey = typeof body.jiraKey === "string" ? body.jiraKey.trim() : "";

  if (!jiraSite || !jiraKey) {
    return NextResponse.json({ error: "Thiếu Jira site hoặc mã ticket" }, { status: 400 });
  }

  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!email || !token) {
    return NextResponse.json(
      { error: "Chưa cấu hình JIRA_EMAIL / JIRA_API_TOKEN trong .env" },
      { status: 500 }
    );
  }

  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const url = `https://${jiraSite}/rest/api/3/issue/${encodeURIComponent(
    jiraKey
  )}?fields=summary,description,priority,issuetype,status`;

  let jiraRes: Response;
  try {
    jiraRes = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });
  } catch {
    return NextResponse.json({ error: "Không kết nối được tới Jira" }, { status: 502 });
  }

  if (!jiraRes.ok) {
    const message =
      jiraRes.status === 401 || jiraRes.status === 403
        ? "Sai JIRA_EMAIL/JIRA_API_TOKEN hoặc không có quyền xem ticket này"
        : jiraRes.status === 404
          ? "Không tìm thấy ticket này trên Jira site đã nhập"
          : `Jira trả về lỗi ${jiraRes.status}`;
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const data = await jiraRes.json();
  const fields = data.fields ?? {};

  return NextResponse.json({
    title: fields.summary ?? jiraKey,
    description: adfToPlainText(fields.description),
    priority: mapJiraPriority(fields.priority?.name),
    type: mapJiraType(fields.issuetype?.name),
    status: mapJiraStatus(fields.status?.statusCategory?.key, fields.status?.name),
    jiraUrl: `https://${jiraSite}/browse/${jiraKey}`,
  });
}
