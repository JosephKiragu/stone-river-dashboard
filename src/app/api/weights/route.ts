import { NextResponse } from "next/server";
import { logWeights } from "@/lib/queries/weights";

export async function POST(req: Request) {
  const body = await req.json();
  // body: { entries: [{ animalId, weightKg, sessionId, loggedAt, notes? }] }
  const { entries } = body;
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "entries array required" }, { status: 400 });
  }
  const logs = await logWeights(
    entries.map((e: { animalId: string; weightKg: number; sessionId: string; loggedAt: string; notes?: string }) => ({
      ...e,
      loggedAt: new Date(e.loggedAt),
    }))
  );
  return NextResponse.json(logs, { status: 201 });
}
