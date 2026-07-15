"use client";

import Link from "next/link";

type Session = { id: string; date: Date | string };
type AdgResult = {
  adgOnFeed: number | null;
  adgSincePurchase: number | null;
  latestWeightKg: number | null;
  logsCount: number;
};
type Row = {
  animal: {
    id: string;
    tagId: string;
    breed: string;
    purchaseWeightKg: number;
    currentPen: { name: string } | null;
  };
  cells: (number | null)[];
  adg: AdgResult;
};
type Matrix = { sessions: Session[]; rows: Row[] };

function fmt(n: number | null, dp = 1) {
  return n === null ? "—" : n.toFixed(dp);
}

export function WeightMatrixClient({ matrix }: { matrix: Matrix }) {
  const { sessions, rows } = matrix;

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No animals or weight data yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr className="bg-zinc-100">
            <th className="text-left px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">Tag</th>
            <th className="text-left px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">Pen</th>
            {sessions.map((s) => (
              <th key={s.id} className="text-right px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">
                {new Date(s.date).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}
              </th>
            ))}
            <th className="text-right px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">ADG on-feed</th>
            <th className="text-right px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">ADG since purchase</th>
            <th className="text-right px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">Gain (kg)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const gain =
              row.adg.latestWeightKg !== null
                ? row.adg.latestWeightKg - row.animal.purchaseWeightKg
                : null;

            return (
              <tr key={row.animal.id} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50"}>
                <td className="px-2 py-1.5 font-medium text-zinc-900 whitespace-nowrap">
                  <Link href={`/dashboard/animals/${row.animal.id}`} className="hover:underline">
                    {row.animal.tagId}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-zinc-500 whitespace-nowrap">
                  {row.animal.currentPen?.name ?? "—"}
                </td>
                {row.cells.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1.5 text-right text-zinc-700 whitespace-nowrap">
                    {cell !== null ? cell.toFixed(1) : "—"}
                  </td>
                ))}
                <td className={`px-2 py-1.5 text-right font-medium whitespace-nowrap ${
                  row.adg.adgOnFeed === null
                    ? "text-zinc-400"
                    : row.adg.adgOnFeed >= 0.8
                    ? "text-green-600"
                    : row.adg.adgOnFeed < 0.6
                    ? "text-red-600"
                    : "text-amber-600"
                }`}>
                  {fmt(row.adg.adgOnFeed, 2)}
                </td>
                <td className="px-2 py-1.5 text-right text-zinc-600 whitespace-nowrap">
                  {fmt(row.adg.adgSincePurchase, 2)}
                </td>
                <td className="px-2 py-1.5 text-right text-zinc-700 whitespace-nowrap">
                  {fmt(gain, 1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
