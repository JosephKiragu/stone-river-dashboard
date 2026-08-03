import { db } from "@/lib/db";
import { FeedUnit } from "@/generated/prisma/client";

// ─── Feed items ───────────────────────────────────────────────────

// Default excludes inactive — the common call site is the stock-entry
// dropdown, where a forgotten argument must NOT leak inactive items.
export async function listFeedItems(includeInactive = false) {
  return db.feedItem.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { name: "asc" },
  });
}

export async function createFeedItem(data: {
  name: string;
  unit: FeedUnit;
  kgPerUnit: number;
}) {
  return db.feedItem.create({ data });
}

export async function updateFeedItem(
  id: string,
  data: Partial<{ name: string; kgPerUnit: number; isActive: boolean }>
) {
  // Deactivation is isActive: false — NEVER a delete. Historical
  // FeedStockEntry rows must keep resolving their feedItem relation.
  return db.feedItem.update({ where: { id }, data });
}

// ─── Stock entries ────────────────────────────────────────────────

export async function createStockEntry(data: {
  feedItemId: string;
  quantity: number;
  costTotal: number;
  purchaseDate: Date;
  supplier?: string;
}) {
  const feedItem = await db.feedItem.findUnique({ where: { id: data.feedItemId } });
  if (!feedItem) throw new Error("Feed item not found");
  if (!feedItem.isActive) throw new Error("Feed item is not active");

  const purchaseDate = new Date(data.purchaseDate);
  purchaseDate.setUTCHours(0, 0, 0, 0);

  return db.feedStockEntry.create({
    data: {
      feedItemId: data.feedItemId,
      quantity: data.quantity,
      quantityKg: data.quantity * feedItem.kgPerUnit,
      costTotal: data.costTotal,
      purchaseDate,
      supplier: data.supplier,
    },
  });
}

export async function listStockEntries(feedItemId?: string) {
  return db.feedStockEntry.findMany({
    where: feedItemId ? { feedItemId } : undefined,
    orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
    include: { feedItem: true },
  });
}

// ─── Stock summary ────────────────────────────────────────────────

export async function getFeedStockSummary() {
  const items = await db.feedItem.findMany({
    orderBy: { name: "asc" },
    include: { stockEntries: true },
  });

  return items.map((item) => {
    const totalKg = item.stockEntries.reduce((s, e) => s + e.quantityKg, 0);
    const totalKes = item.stockEntries.reduce((s, e) => s + e.costTotal, 0);
    const wacKesPerKg = totalKg > 0 ? totalKes / totalKg : null;

    // M3: stock on hand = Σ FeedStockEntry.quantityKg (purchases only).
    // The canonical formula (BUILD-FLOW §6) is Σ purchases − Σ feedout.
    // FeedOutLog does not exist yet — M4 MUST add the subtraction here.
    // WAC stays Σ costTotal ÷ Σ quantityKg over ALL purchases even after
    // M4 adds depletion — do not recompute WAC from remaining stock.
    const stockOnHandKg = totalKg;

    return {
      feedItem: {
        id: item.id,
        name: item.name,
        unit: item.unit,
        kgPerUnit: item.kgPerUnit,
        isActive: item.isActive,
      },
      stockOnHandKg,
      wacKesPerKg,
      valueKes: wacKesPerKg !== null ? stockOnHandKg * wacKesPerKg : null,
    };
  });
}
