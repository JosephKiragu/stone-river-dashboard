import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { listFeedItems, createFeedItem } from "@/lib/queries/feed";

export async function GET() {
  const items = await listFeedItems(true);
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, unit, kgPerUnit } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!Number.isFinite(kgPerUnit) || kgPerUnit <= 0) {
    return NextResponse.json({ error: "kgPerUnit must be greater than 0" }, { status: 400 });
  }

  try {
    const item = await createFeedItem({ name: name.trim(), unit, kgPerUnit });
    return NextResponse.json(item, { status: 201 });
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json({ error: "Feed item name already exists" }, { status: 409 });
    }
    throw err;
  }
}
