import { NextResponse } from "next/server";
import { listStockEntries } from "@/lib/queries/feed";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const item = searchParams.get("item") ?? undefined;
  const entries = await listStockEntries(item);
  return NextResponse.json(entries);
}
