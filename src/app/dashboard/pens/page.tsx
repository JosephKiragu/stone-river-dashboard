import Link from "next/link";
import { listPens, createPen } from "@/lib/queries/pens";
import { redirect } from "next/navigation";

export default async function PensPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const pens = await listPens();

  async function handleCreatePen(formData: FormData) {
    "use server";
    const name = (formData.get("name") as string)?.trim();
    const capacityRaw = formData.get("capacity") as string;
    const capacity = capacityRaw ? parseInt(capacityRaw, 10) : undefined;
    if (!name) redirect("/dashboard/pens?error=Name%20is%20required");
    await createPen({ name, capacity });
    redirect("/dashboard/pens");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-zinc-900">Pens</h1>
      </div>

      {/* Pen list */}
      <div className="space-y-3">
        {pens.length === 0 && (
          <p className="text-sm text-zinc-400">No pens yet.</p>
        )}
        {pens.map((pen) => (
          <Link
            key={pen.id}
            href={`/dashboard/pens/${pen.id}`}
            className="block rounded-xl border border-zinc-200 bg-white px-4 py-4 hover:border-zinc-400 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-zinc-900">{pen.name}</p>
                {pen.capacity && (
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Capacity: {pen.capacity} head
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-zinc-900">
                  {pen.activeHeadCount}
                </p>
                <p className="text-xs text-zinc-400">active</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* New pen form */}
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">Add pen</h2>
        {error && (
          <p className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <form action={handleCreatePen} className="flex gap-2">
          <input
            name="name"
            type="text"
            required
            placeholder="Pen name (e.g. Pen 1)"
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
          <input
            name="capacity"
            type="number"
            min="1"
            placeholder="Cap."
            className="w-20 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
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
