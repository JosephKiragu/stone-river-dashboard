import Link from "next/link";
import { listAnimals } from "@/lib/queries/animals";
import { listPens } from "@/lib/queries/pens";
import { AnimalStatus } from "@/generated/prisma/client";
import { AnimalFilters } from "@/components/AnimalFilters";

export default async function AnimalsPage({
  searchParams,
}: {
  searchParams: Promise<{ penId?: string; status?: string }>;
}) {
  const { penId, status } = await searchParams;
  const validStatus =
    status && Object.values(AnimalStatus).includes(status as AnimalStatus)
      ? (status as AnimalStatus)
      : undefined;

  const [animals, pens] = await Promise.all([
    listAnimals({ penId, status: validStatus }),
    listPens(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-zinc-900">Animals</h1>
        <Link
          href="/dashboard/animals/new"
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
        >
          + Register
        </Link>
      </div>

      <AnimalFilters pens={pens} currentPenId={penId} currentStatus={status} />

      <div className="space-y-2">
        {animals.length === 0 && (
          <p className="text-sm text-zinc-400">No animals match the filter.</p>
        )}
        {animals.map((animal) => {
          const currentPen = animal.assignments[0]?.pen;
          const daysOnLot = Math.floor(
            (Date.now() - new Date(animal.purchaseDate).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          return (
            <Link
              key={animal.id}
              href={`/dashboard/animals/${animal.id}`}
              className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-400 transition-colors"
            >
              <div>
                <p className="font-medium text-zinc-900">{animal.tagId}</p>
                <p className="text-xs text-zinc-400">
                  {animal.breed} · {currentPen?.name ?? "—"}
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    animal.status === "ACTIVE"
                      ? "bg-green-50 text-green-700"
                      : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  {animal.status}
                </span>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {daysOnLot}d on lot
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
