import Link from "next/link";
import { redirect } from "next/navigation";
import { listFeedItems, createStockEntry } from "@/lib/queries/feed";

export const dynamic = "force-dynamic";

export default async function NewStockEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const feedItems = await listFeedItems();

  async function handleCreate(formData: FormData) {
    "use server";
    const feedItemId = formData.get("feedItemId") as string;
    const quantityRaw = formData.get("quantity") as string;
    const costTotalRaw = formData.get("costTotal") as string;
    const purchaseDateRaw = formData.get("purchaseDate") as string;
    const supplier = (formData.get("supplier") as string)?.trim() || undefined;

    const quantity = parseFloat(quantityRaw);
    const costTotal = parseFloat(costTotalRaw);

    if (!feedItemId) {
      redirect("/dashboard/feed/stock/new?error=Feed%20item%20is%20required");
    }
    if (!purchaseDateRaw) {
      redirect("/dashboard/feed/stock/new?error=Purchase%20date%20is%20required");
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      redirect("/dashboard/feed/stock/new?error=Quantity%20must%20be%20greater%20than%200");
    }
    if (!Number.isFinite(costTotal) || costTotal < 0) {
      redirect("/dashboard/feed/stock/new?error=Cost%20must%20be%200%20or%20more");
    }

    try {
      await createStockEntry({
        feedItemId,
        quantity,
        costTotal,
        purchaseDate: new Date(purchaseDateRaw),
        supplier,
      });
    } catch (err: unknown) {
      const e = err as Error;
      redirect(`/dashboard/feed/stock/new?error=${encodeURIComponent(e.message)}`);
    }
    redirect("/dashboard/feed");
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/feed" className="text-xs text-zinc-400 hover:text-zinc-600">
          ← Feed stock
        </Link>
        <h1 className="text-lg font-bold text-zinc-900 mt-1">Record stock arrival</h1>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {feedItems.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No active feed items.{" "}
          <Link href="/dashboard/settings/feeds" className="underline">
            Add one first
          </Link>
          .
        </p>
      ) : (
        <form action={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Feed item <span className="text-red-500">*</span>
            </label>
            <select
              name="feedItemId"
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-500 focus:outline-none"
            >
              {feedItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.unit})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Quantity <span className="text-red-500">*</span>
            </label>
            <input
              name="quantity"
              type="number"
              step="any"
              min="0"
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Total cost (KES) <span className="text-red-500">*</span>
            </label>
            <input
              name="costTotal"
              type="number"
              step="any"
              min="0"
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Purchase date <span className="text-red-500">*</span>
            </label>
            <input
              name="purchaseDate"
              type="date"
              required
              defaultValue={todayStr}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Supplier</label>
            <input
              name="supplier"
              type="text"
              placeholder="Optional"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
          >
            Record arrival
          </button>
        </form>
      )}
    </div>
  );
}
