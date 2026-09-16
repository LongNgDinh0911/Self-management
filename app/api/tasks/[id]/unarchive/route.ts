import { NextRequest, NextResponse } from "next/server";
import { setTaskArchived } from "@/lib/tasks";
import { emitTaskUpdate } from "@/lib/socket";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = await setTaskArchived(id, false);
  emitTaskUpdate(task);
  return NextResponse.json(task);
}
