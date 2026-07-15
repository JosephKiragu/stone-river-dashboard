import { NextResponse } from "next/server";
import { listWeighSessions, createWeighSession } from "@/lib/queries/weights";
import { Prisma } from "@/generated/prisma/client";

export async function GET() {
  const sessions = await listWeighSessions();
  return NextResponse.json(sessions);
}

export async function POST(req: Request) {
  const { date, notes } = await req.json();
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });
  try {
    const session = await createWeighSession(new Date(date), notes);
    return NextResponse.json(session, { status: 201 });
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A session already exists for this date" },
        { status: 409 }
      );
    }
    throw err;
  }
}
