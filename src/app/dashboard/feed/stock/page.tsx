import Link from "next/link";
import { listStockEntries, listFeedItems } from "@/lib/queries/feed";
import { FeedItemFilter } from "./FeedItemFilter";

export const dynamic = "force-dynamic";

function fmt(n: number, dp = 1) {
  return n.toFixed(dp);
}

export default async function FeedStockHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { item } = await searchParams;
  const [entries, feedItems] = await Promise.all([
    listStockEntries(item || undefined),
    listFeedItems(true),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/feed" className="text-xs text-zinc-400 hover:text-zinc-600">
            ← Feed stock
          </Link>
          <h1 className="text-lg font-bold text-zinc-900 mt-1">Stock entry history</h1>
        </div>
        <FeedItemFilter feedItems={feedItems} currentItemId={item} />
      </div>

      {entries.length === 0 && (
        <p className="text-sm text-zinc-500">No stock entries yet.</p>
      )}

      {entries.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="text-left px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">Date</th>
                <th className="text-left px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">Item</th>
                <th className="text-right px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">Quantity</th>
                <th className="text-right px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">Kg</th>
                <th className="text-right px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">Cost (KES)</th>
                <th className="text-right px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">KES/kg</th>
                <th className="text-left px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">Supplier</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(e.purchaseDate).toLocaleDateString("en-KE", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{e.feedItem.name}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {fmt(e.quantity)} {e.feedItem.unit}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(e.quantityKg)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(e.costTotal, 0)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {fmt(e.costTotal / e.quantityKg, 2)}
                  </td>
                  <td className="px-3 py-2 text-zinc-500 whitespace-nowrap">{e.supplier ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
