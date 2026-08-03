import { db } from "@/lib/db";

export async function GET() {
  const entries = await db.feedStockEntry.findMany({
    orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
    include: { feedItem: { select: { name: true, unit: true } } },
  });

  const headers = [
    "purchaseDate",
    "feedItemName",
    "unit",
    "quantity",
    "quantityKg",
    "costTotal",
    "impliedKesPerKg",
    "supplier",
  ];
  const rows = entries.map((e) => [
    e.purchaseDate.toISOString().slice(0, 10),
    e.feedItem.name,
    e.feedItem.unit,
    e.quantity,
    e.quantityKg,
    e.costTotal,
    e.quantityKg > 0 ? (e.costTotal / e.quantityKg).toFixed(2) : "",
    e.supplier ?? "",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="feed-stock-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
