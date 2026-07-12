import Link from "next/link";
import { getPenWithAnimals } from "@/lib/queries/pens";
import { notFound } from "next/navigation";

export default async function PenDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pen = await getPenWithAnimals(id);
  if (!pen) notFound();

  const activeAnimals = pen.assignments.map((a) => a.animal);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/pens"
          className="text-xs text-zinc-400 hover:text-zinc-600"
        >
          ← Pens
        </Link>
        <h1 className="text-lg font-bold text-zinc-900 mt-1">{pen.name}</h1>
        <p className="text-sm text-zinc-500">
          {activeAnimals.length} active head
          {pen.capacity ? ` · capacity ${pen.capacity}` : ""}
        </p>
      </div>

      <div className="space-y-2">
        {activeAnimals.length === 0 && (
          <p className="text-sm text-zinc-400">No animals assigned.</p>
        )}
        {activeAnimals.map((animal) => (
          <Link
            key={animal.id}
            href={`/dashboard/animals/${animal.id}`}
            className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-400 transition-colors"
          >
            <div>
              <p className="font-medium text-zinc-900">{animal.tagId}</p>
              <p className="text-xs text-zinc-400">{animal.breed}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-zinc-700">
                {animal.purchaseWeightKg} kg
              </p>
              <p className="text-xs text-zinc-400">purchase wt</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
