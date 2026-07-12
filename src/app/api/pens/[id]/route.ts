import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, capacity, isActive } = body;
  const pen = await db.pen.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(capacity !== undefined ? { capacity } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  });
  return NextResponse.json(pen);
}
