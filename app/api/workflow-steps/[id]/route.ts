import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.pauseAfter === "boolean") data.pauseAfter = body.pauseAfter;
  if (body.config && typeof body.config === "object") {
    data.config = JSON.stringify(body.config);
  }

  // Re-parenting (dragging a connection onto a different node in the
  // builder canvas): a step can't become its own ancestor, and its new
  // sibling order defaults to "last" under the new parent unless given.
  if ("parentStepId" in body) {
    const parentStepId = typeof body.parentStepId === "string" ? body.parentStepId : null;
    if (parentStepId === id) {
      return NextResponse.json({ error: "Step không thể là cha của chính nó" }, { status: 400 });
    }

    const step = await prisma.workflowStep.findUnique({ where: { id } });
    if (!step) {
      return NextResponse.json({ error: "Không tìm thấy step" }, { status: 404 });
    }

    if (parentStepId) {
      let cursor: string | null = parentStepId;
      while (cursor) {
        if (cursor === id) {
          return NextResponse.json(
            { error: "Không thể tạo vòng lặp trong cây step" },
            { status: 400 }
          );
        }
        const parent: { parentStepId: string | null } | null = await prisma.workflowStep.findUnique({
          where: { id: cursor },
          select: { parentStepId: true },
        });
        cursor = parent?.parentStepId ?? null;
      }
    }

    data.parentStepId = parentStepId;
    if (typeof body.order === "number") {
      data.order = body.order;
    } else {
      const lastSibling = await prisma.workflowStep.findFirst({
        where: { id: { not: id }, workflowId: step.workflowId, parentStepId },
        orderBy: { order: "desc" },
      });
      data.order = (lastSibling?.order ?? -1) + 1;
    }
  } else if (typeof body.order === "number") {
    data.order = body.order;
  }

  const step = await prisma.workflowStep.update({ where: { id }, data });
  return NextResponse.json(step);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.workflowStep.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
