import { redirect } from "next/navigation";
import { Prisma, FeedUnit } from "@/generated/prisma/client";
import { listFeedItems, createFeedItem, updateFeedItem } from "@/lib/queries/feed";

export const dynamic = "force-dynamic";

export default async function FeedCataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const feedItems = await listFeedItems(true);

  async function handleCreate(formData: FormData) {
    "use server";
    const name = (formData.get("name") as string)?.trim();
    const unit = formData.get("unit") as FeedUnit;
    const kgPerUnitRaw = formData.get("kgPerUnit") as string;
    const kgPerUnit = parseFloat(kgPerUnitRaw);

    if (!name) {
      redirect("/dashboard/settings/feeds?error=Name%20is%20required");
    }
    if (!Number.isFinite(kgPerUnit) || kgPerUnit <= 0) {
      redirect("/dashboard/settings/feeds?error=kg%20per%20unit%20must%20be%20greater%20than%200");
    }

    try {
      await createFeedItem({ name, unit, kgPerUnit });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        redirect(
          `/dashboard/settings/feeds?error=Feed%20item%20%27${encodeURIComponent(
            name
          )}%27%20already%20exists`
        );
      }
      throw err;
    }
    redirect("/dashboard/settings/feeds");
  }

  async function handleToggleActive(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const isActive = formData.get("isActive") === "true";
    await updateFeedItem(id, { isActive: !isActive });
    redirect("/dashboard/settings/feeds");
  }

  async function handleUpdateKgPerUnit(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const kgPerUnitRaw = formData.get("kgPerUnit") as string;
    const kgPerUnit = parseFloat(kgPerUnitRaw);
    if (!Number.isFinite(kgPerUnit) || kgPerUnit <= 0) {
      redirect("/dashboard/settings/feeds?error=kg%20per%20unit%20must%20be%20greater%20than%200");
    }
    await updateFeedItem(id, { kgPerUnit });
    redirect("/dashboard/settings/feeds");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-zinc-900">Feed catalogue</h1>

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {feedItems.length === 0 && (
        <p className="text-sm text-zinc-500">No feed items yet. Add one below.</p>
      )}

      {feedItems.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="text-left px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">Name</th>
                <th className="text-left px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">Unit</th>
                <th className="text-right px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">kg/unit</th>
                <th className="text-right px-3 py-2 font-semibold text-zinc-700 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {feedItems.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-zinc-100 last:border-0 ${
                    !item.isActive ? "text-zinc-400" : ""
                  }`}
                >
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{item.name}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{item.unit}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <form action={handleUpdateKgPerUnit} className="inline-flex items-center gap-1">
                      <input type="hidden" name="id" value={item.id} />
                      <input
                        name="kgPerUnit"
                        type="number"
                        step="any"
                        min="0"
                        defaultValue={item.kgPerUnit}
                        className="w-20 rounded border border-zinc-300 px-2 py-1 text-right text-sm focus:border-zinc-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="text-xs text-zinc-500 hover:text-zinc-800 underline underline-offset-2"
                      >
                        Save
                      </button>
                    </form>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <form action={handleToggleActive} className="inline">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="isActive" value={String(item.isActive)} />
                      <button
                        type="submit"
                        className={`text-xs underline underline-offset-2 ${
                          item.isActive
                            ? "text-red-600 hover:text-red-800"
                            : "text-green-600 hover:text-green-800"
                        }`}
                      >
                        {item.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">Add feed item</h2>
        <form action={handleCreate} className="flex gap-2">
          <input
            name="name"
            type="text"
            required
            placeholder="Name (e.g. Hay)"
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
          <select
            name="unit"
            defaultValue="KG"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          >
            <option value="KG">KG</option>
            <option value="BALES">BALES</option>
            <option value="BAGS">BAGS</option>
          </select>
          <input
            name="kgPerUnit"
            type="number"
            step="any"
            min="0"
            defaultValue={1}
            placeholder="kg/unit"
            className="w-24 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
          >
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
