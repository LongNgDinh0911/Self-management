import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "Thiếu projectId" }, { status: 400 });
  }

  const workflows = await prisma.workflow.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { steps: true } } },
  });

  return NextResponse.json(workflows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const projectId = String(body.projectId ?? "");
  const name = String(body.name ?? "").trim();

  if (!projectId || !name) {
    return NextResponse.json({ error: "Thiếu projectId hoặc tên workflow" }, { status: 400 });
  }

  const workflow = await prisma.workflow.create({
    data: {
      projectId,
      name,
      steps: {
        create: [
          {
            order: 0,
            type: "ai_step",
            name: "AI edit code",
            config: JSON.stringify({
              prompt: "{{task.title}}\n\n{{task.description}}",
            }),
          },
        ],
      },
    },
    include: { steps: true },
  });

  // The second default step is a child of the first — nested creates can't
  // reference a sibling's generated id, so it's created as a follow-up.
  await prisma.workflowStep.create({
    data: {
      workflowId: workflow.id,
      parentStepId: workflow.steps[0].id,
      order: 0,
      type: "action",
      name: "Create pull request",
      config: JSON.stringify({ actionType: "create_pr" }),
    },
  });

  const full = await prisma.workflow.findUniqueOrThrow({
    where: { id: workflow.id },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json(full, { status: 201 });
}
