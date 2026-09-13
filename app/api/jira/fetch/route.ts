import { NextRequest, NextResponse } from "next/server";
import { adfToPlainText, mapJiraPriority, mapJiraStatus, mapJiraType } from "@/lib/jira";
import { getValidAccessToken } from "@/lib/jira-oauth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const jiraSite = typeof body.jiraSite === "string" ? body.jiraSite.trim() : "";
  const jiraKey = typeof body.jiraKey === "string" ? body.jiraKey.trim() : "";

  if (!jiraKey) {
    return NextResponse.json({ error: "Thiếu mã ticket" }, { status: 400 });
  }

  const auth = await getValidAccessToken(jiraSite || null);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const url = `https://api.atlassian.com/ex/jira/${auth.cloudId}/rest/api/3/issue/${encodeURIComponent(
    jiraKey
  )}?fields=summary,description,priority,issuetype,status`;

  let jiraRes: Response;
  try {
    jiraRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        Accept: "application/json",
      },
    });
  } catch {
    return NextResponse.json({ error: "Không kết nối được tới Jira" }, { status: 502 });
  }

  if (!jiraRes.ok) {
    const message =
      jiraRes.status === 401 || jiraRes.status === 403
        ? "Không có quyền xem ticket này — kiểm tra lại kết nối Jira trong Settings"
        : jiraRes.status === 404
          ? "Không tìm thấy ticket này trên site Jira đã kết nối"
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
    jiraUrl: jiraSite ? `https://${jiraSite}/browse/${jiraKey}` : undefined,
  });
}
