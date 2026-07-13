import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Temporary diagnostic route — delete after debugging
export async function GET() {
  try {
    const count = await db.pen.count();
    return NextResponse.json({ ok: true, penCount: count, node: process.version });
  } catch (err: unknown) {
    const e = err as Error;
    return NextResponse.json(
      { ok: false, error: e.message, stack: e.stack?.split("\n").slice(0, 5) },
      { status: 500 }
    );
  }
}
