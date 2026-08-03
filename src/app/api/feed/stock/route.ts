import { NextResponse } from "next/server";
import { getFeedStockSummary, createStockEntry } from "@/lib/queries/feed";

export async function GET() {
  const summary = await getFeedStockSummary();
  return NextResponse.json(summary);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { feedItemId, quantity, costTotal, purchaseDate, supplier } = body;

  if (!feedItemId) {
    return NextResponse.json({ error: "feedItemId is required" }, { status: 400 });
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "quantity must be greater than 0" }, { status: 400 });
  }
  if (!Number.isFinite(costTotal) || costTotal < 0) {
    return NextResponse.json({ error: "costTotal must be 0 or more" }, { status: 400 });
  }
  if (!purchaseDate) {
    return NextResponse.json({ error: "purchaseDate is required" }, { status: 400 });
  }

  try {
    // quantityKg is always server-computed inside createStockEntry from the
    // feed item's kgPerUnit — a client-supplied quantityKg (if sent) is
    // ignored (D8).
    const entry = await createStockEntry({
      feedItemId,
      quantity,
      costTotal,
      purchaseDate: new Date(purchaseDate),
      supplier,
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (err: unknown) {
    const e = err as Error;
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
