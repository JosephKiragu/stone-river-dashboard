"use client";

import { useState } from "react";
import Link from "next/link";

type Session = { id: string; date: Date | string };
type AdgResult = {
  adgOnFeed: number | null;
  adgSincePurchase: number | null;
  latestWeightKg: number | null;
  logsCount: number;
};
type Pen = { id: string; name: string };
type Row = {
  animal: {
    id: string;
    tagId: string;
    breed: string;
    purchaseWeightKg: number;
    purchaseDate: Date | string;
    currentPen: Pen | null;
  };
  cells: (number | null)[];
  adg: AdgResult;
  lastIntervalGainKg: number | null;
  totalGainSincePurchaseKg: number | null;
};
type Matrix = { sessions: Session[]; rows: Row[] };

function fmt(n: number | null, dp = 1) {
  return n === null ? "—" : n.toFixed(dp);
}

function avg(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((s, v) => s + v, 0) / present.length;
}

export function WeightMatrixClient({ matrix }: { matrix: Matrix }) {
  const { sessions, rows } = matrix;
  const [filter, setFilter] = useState<string>("all"); // penId or "all"

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No animals or weight data yet.</p>;
  }

  const pens = Array.from(
    new Map(
      rows
        .filter((r) => r.animal.currentPen)
        .map((r) => [r.animal.currentPen!.id, r.animal.currentPen!])
    ).values()
  );

  const filteredRows =
    filter === "all" ? rows : rows.filter((r) => r.animal.currentPen?.id === filter);

  // AVERAGE row, recomputed for whatever's currently filtered — mirrors the
  // bottom AVERAGE row on Jeremy's "Full Herd / Lot 1 / Lot 2" sheets.
  const avgCells = sessions.map((_, ci) => avg(filteredRows.map((r) => r.cells[ci])));
  const avgWeeklyGain = avg(filteredRows.map((r) => r.lastIntervalGainKg));
  const avgGainSincePurchase = avg(filteredRows.map((r) => r.totalGainSincePurchaseKg));
  const avgDailyGain = avg(filteredRows.map((r) => r.adg.adgSincePurchase));
  const avgPurchaseWeight = avg(filteredRows.map((r) => r.animal.purchaseWeightKg));

  // Purchase weight is animal-level, not a shared WeighSession — the header
  // shows the filtered group's purchase date if they all share one (true for
  // a single-lot pen), otherwise a generic label rather than one date that
  // wouldn't apply to every row (e.g. "Full herd" spanning multiple lots).
  const purchaseDates = new Set(
    filteredRows.map((r) => new Date(r.animal.purchaseDate).toDateString())
  );
  const purchaseHeader =
    purchaseDates.size === 1 && filteredRows[0]
      ? new Date(filteredRows[0].animal.purchaseDate).toLocaleDateString("en-KE", {
          month: "short",
          day: "numeric",
        })
      : "Purchase";

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            filter === "all"
              ? "bg-zinc-900 text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          Full herd
        </button>
        {pens.map((p) => (
          <button
            key={p.id}
            onClick={() => setFilter(p.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === p.id
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-zinc-100">
              <th className="text-left px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">Tag</th>
              <th className="text-left px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">Pen</th>
              <th className="text-right px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">{purchaseHeader}</th>
              {sessions.map((s) => (
                <th key={s.id} className="text-right px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">
                  {new Date(s.date).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}
                </th>
              ))}
              <th className="text-right px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">Current weeks gain</th>
              <th className="text-right px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">Total gain</th>
              <th className="text-right px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">Daily gain (kg/day)</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, i) => (
              <tr key={row.animal.id} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50"}>
                <td className="px-2 py-1.5 font-medium text-zinc-900 whitespace-nowrap">
                  <Link href={`/dashboard/animals/${row.animal.id}`} className="hover:underline">
                    {row.animal.tagId}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-zinc-500 whitespace-nowrap">
                  {row.animal.currentPen?.name ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-right text-zinc-500 whitespace-nowrap">
                  {row.animal.purchaseWeightKg.toFixed(1)}
                </td>
                {row.cells.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1.5 text-right text-zinc-700 whitespace-nowrap">
                    {cell !== null ? cell.toFixed(1) : "—"}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right text-zinc-700 whitespace-nowrap">
                  {fmt(row.lastIntervalGainKg, 1)}
                </td>
                <td className="px-2 py-1.5 text-right text-zinc-700 whitespace-nowrap">
                  {fmt(row.totalGainSincePurchaseKg, 1)}
                </td>
                <td className={`px-2 py-1.5 text-right font-medium whitespace-nowrap ${
                  row.adg.adgSincePurchase === null
                    ? "text-zinc-400"
                    : row.adg.adgSincePurchase >= 0.8
                    ? "text-green-600"
                    : row.adg.adgSincePurchase < 0.6
                    ? "text-red-600"
                    : "text-amber-600"
                }`}>
                  {fmt(row.adg.adgSincePurchase, 2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-300 bg-zinc-100 font-semibold">
              <td className="px-2 py-1.5 text-zinc-900 whitespace-nowrap">AVERAGE</td>
              <td className="px-2 py-1.5"></td>
              <td className="px-2 py-1.5 text-right text-zinc-800 whitespace-nowrap">
                {fmt(avgPurchaseWeight, 1)}
              </td>
              {avgCells.map((v, ci) => (
                <td key={ci} className="px-2 py-1.5 text-right text-zinc-800 whitespace-nowrap">
                  {fmt(v, 1)}
                </td>
              ))}
              <td className="px-2 py-1.5 text-right text-zinc-800 whitespace-nowrap">
                {fmt(avgWeeklyGain, 1)}
              </td>
              <td className="px-2 py-1.5 text-right text-zinc-800 whitespace-nowrap">
                {fmt(avgGainSincePurchase, 1)}
              </td>
              <td className="px-2 py-1.5 text-right text-zinc-800 whitespace-nowrap">
                {fmt(avgDailyGain, 2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
