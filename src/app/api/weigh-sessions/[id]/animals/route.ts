import { NextResponse } from "next/server";
import { getAnimalsForSession } from "@/lib/queries/weights";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getAnimalsForSession(id);
  if (!data) return NextResponse.json({ error: "session not found" }, { status: 404 });
  return NextResponse.json(data);
}
