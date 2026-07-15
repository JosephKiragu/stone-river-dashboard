import { NextResponse } from "next/server";
import { deleteWeightLog } from "@/lib/queries/weights";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteWeightLog(id);
  return NextResponse.json({ ok: true });
}
