import Link from "next/link";
import { getAnimal } from "@/lib/queries/animals";
import { notFound } from "next/navigation";
import { computeAdg } from "@/lib/queries/weights";
import { WeightChartClient } from "./WeightChartClient";

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
  const adg = computeAdg(
    animal.weightLogs,
    animal.purchaseWeightKg,
    animal.purchaseDate
  );

  const age = animal.ageAtPurchaseMonths;
  let ageDisplay = "—";
  if (age != null) {
    const yrs = Math.floor(age / 12);
    const mo = age % 12;
    if (yrs === 0) ageDisplay = `${mo} mo`;
    else if (mo === 0) ageDisplay = `${yrs} yr`;
    else ageDisplay = `${yrs} yr ${mo} mo`;
  }

  const rows: { label: string; value: string }[] = [
    { label: "Tag ID", value: animal.tagId },
    { label: "Breed", value: animal.breed },
    { label: "Status", value: animal.status },
    {
      label: "Age at purchase",
      value: ageDisplay,
    },
    { label: "Purchase date", value: formatDate(animal.purchaseDate) },
    { label: "Purchase weight", value: `${animal.purchaseWeightKg} kg` },
    {
      label: "Purchase price",
      value: `KES ${animal.purchasePriceKes.toLocaleString("en-KE")}`,
    },
    {
      label: "Purchase market",
      value: animal.purchaseMarket ?? "—",
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

      {/* ADG summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <p className="text-xs text-zinc-500">ADG on-feed</p>
          <p className="text-xl font-bold text-zinc-900">
            {adg.adgOnFeed !== null ? `${adg.adgOnFeed.toFixed(2)} kg/day` : "—"}
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">needs ≥ 2 weigh sessions</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <p className="text-xs text-zinc-500">ADG since purchase</p>
          <p className="text-xl font-bold text-zinc-900">
            {adg.adgSincePurchase !== null ? `${adg.adgSincePurchase.toFixed(2)} kg/day` : "—"}
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">
            purchase: {animal.purchaseWeightKg} kg
          </p>
        </div>
      </div>

      {/* Weight chart */}
      {animal.weightLogs.length > 0 && (
        <WeightChartClient
          data={animal.weightLogs.map((l) => ({
            date: l.loggedAt.toISOString().slice(0, 10),
            weightKg: l.weightKg,
          }))}
        />
      )}

      {/* Weight history */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-700">Weight history</h2>
        {animal.weightLogs.length === 0 ? (
          <p className="text-sm text-zinc-400">No weights logged yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left py-1.5 font-medium text-zinc-500">Date</th>
                <th className="text-right py-1.5 font-medium text-zinc-500">Weight (kg)</th>
                <th className="text-right py-1.5 font-medium text-zinc-500">Interval ADG</th>
              </tr>
            </thead>
            <tbody>
              {animal.weightLogs.map((log, i) => {
                const prev = animal.weightLogs[i - 1];
                const intervalAdg = prev
                  ? (log.weightKg - prev.weightKg) /
                    ((new Date(log.loggedAt).getTime() - new Date(prev.loggedAt).getTime()) /
                      86_400_000)
                  : null;
                return (
                  <tr key={log.id} className="border-b border-zinc-50">
                    <td className="py-1.5 text-zinc-700">
                      {new Date(log.loggedAt).toLocaleDateString("en-KE", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="py-1.5 text-right font-medium text-zinc-900">
                      {log.weightKg.toFixed(1)}
                    </td>
                    <td className="py-1.5 text-right text-zinc-500">
                      {intervalAdg !== null ? `${intervalAdg.toFixed(2)} kg/d` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
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
