import Link from "next/link";
import { getAnimal } from "@/lib/queries/animals";
import { notFound } from "next/navigation";

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function AnimalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const animal = await getAnimal(id);
  if (!animal) notFound();

  const currentAssignment = animal.assignments.find((a) => a.to === null);
  const currentPen = currentAssignment?.pen;
  const daysOnLot = Math.floor(
    (Date.now() - new Date(animal.purchaseDate).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const rows: { label: string; value: string }[] = [
    { label: "Tag ID", value: animal.tagId },
    { label: "Breed", value: animal.breed },
    { label: "Status", value: animal.status },
    {
      label: "Date of birth",
      value: animal.dateOfBirth ? formatDate(animal.dateOfBirth) : "—",
    },
    { label: "Purchase date", value: formatDate(animal.purchaseDate) },
    { label: "Purchase weight", value: `${animal.purchaseWeightKg} kg` },
    {
      label: "Purchase price",
      value: `KES ${animal.purchasePriceKes.toLocaleString("en-KE")}`,
    },
    { label: "Current pen", value: currentPen?.name ?? "—" },
    { label: "Days on lot", value: `${daysOnLot}` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/animals"
          className="text-xs text-zinc-400 hover:text-zinc-600"
        >
          ← Animals
        </Link>
        <h1 className="text-lg font-bold text-zinc-900 mt-1">{animal.tagId}</h1>
        <p className="text-sm text-zinc-500">{animal.breed}</p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={`flex justify-between items-center px-4 py-3 ${
              i < rows.length - 1 ? "border-b border-zinc-100" : ""
            }`}
          >
            <span className="text-sm text-zinc-500">{row.label}</span>
            <span className="text-sm font-medium text-zinc-900">
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {/* Pen history */}
      {animal.assignments.length > 1 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 mb-2">
            Pen history
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
            {animal.assignments.map((a, i) => (
              <div
                key={a.id}
                className={`flex justify-between items-center px-4 py-3 ${
                  i < animal.assignments.length - 1
                    ? "border-b border-zinc-100"
                    : ""
                }`}
              >
                <span className="text-sm font-medium text-zinc-900">
                  {a.pen.name}
                </span>
                <span className="text-xs text-zinc-400">
                  {formatDate(a.from)} →{" "}
                  {a.to ? formatDate(a.to) : "present"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
