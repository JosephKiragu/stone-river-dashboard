import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const pens = await db.pen.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    include: {
      assignments: { where: { to: null }, select: { id: true } },
    },
  });
  return NextResponse.json(
    pens.map((p) => ({ ...p, activeHeadCount: p.assignments.length }))
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, capacity } = body;
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const pen = await db.pen.create({
    data: { name: name.trim(), capacity: capacity ?? undefined },
  });
  return NextResponse.json(pen, { status: 201 });
}
