import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { updateFeedItem } from "@/lib/queries/feed";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, kgPerUnit, isActive } = body;

  if (kgPerUnit !== undefined && (!Number.isFinite(kgPerUnit) || kgPerUnit <= 0)) {
    return NextResponse.json({ error: "kgPerUnit must be greater than 0" }, { status: 400 });
  }

  try {
    const item = await updateFeedItem(id, {
      ...(name !== undefined ? { name } : {}),
      ...(kgPerUnit !== undefined ? { kgPerUnit } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    });
    return NextResponse.json(item);
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json({ error: "Feed item name already exists" }, { status: 409 });
    }
    throw err;
  }
}
