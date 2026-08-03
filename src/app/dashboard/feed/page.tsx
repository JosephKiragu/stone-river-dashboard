import Link from "next/link";
import { getFeedStockSummary } from "@/lib/queries/feed";

export const dynamic = "force-dynamic";

function fmt(n: number | null, dp = 1) {
  return n === null ? "—" : n.toFixed(dp);
}

export default async function FeedPage() {
  const summary = await getFeedStockSummary();
  const visible = summary.filter(
    (s) => s.feedItem.isActive || s.stockOnHandKg > 0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-zinc-900">Feed stock</h1>
        <div className="flex gap-2">
          <Link
            href="/dashboard/feed/stock"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            History
          </Link>
          <Link
            href="/dashboard/feed/stock/new"
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
          >
            + Record arrival
          </Link>
        </div>
      </div>

      {visible.length === 0 && (
        <p className="text-sm text-zinc-500">
          No feed items yet.{" "}
          <Link href="/dashboard/settings/feeds" className="underline">
            Add one
          </Link>
          .
        </p>
      )}

      {visible.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="text-left px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">
                  Item
                </th>
                <th className="text-right px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">
                  Stock on hand
                </th>
                <th className="text-right px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">
                  WAC (KES/kg)
                </th>
                <th className="text-right px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">
                  Value (KES)
                </th>
                <th className="text-right px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">
                  Days remaining
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.feedItem.id}
                  className={`border-b border-zinc-100 last:border-0 ${
                    !row.feedItem.isActive ? "text-zinc-400" : ""
                  }`}
                >
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    {row.feedItem.name}
                    {!row.feedItem.isActive && (
                      <span className="ml-1.5 text-xs text-zinc-400">(inactive)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {fmt(row.stockOnHandKg / row.feedItem.kgPerUnit)} {row.feedItem.unit} (
                    {fmt(row.stockOnHandKg)} kg)
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {fmt(row.wacKesPerKg, 2)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                    {fmt(row.valueKes, 0)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-400 whitespace-nowrap">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Link
        href="/dashboard/settings/feeds"
        className="text-sm text-zinc-500 hover:text-zinc-700 underline underline-offset-2"
      >
        Manage feed catalogue →
      </Link>
    </div>
  );
}
