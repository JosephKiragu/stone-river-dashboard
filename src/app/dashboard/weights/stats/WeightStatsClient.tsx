"use client";

import { useMemo, useState } from "react";
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

// See DECISIONS.md 2026-07-24 for why these values, confirmed with Kiragu.
const STAGNANT_BAND_KG = 0.5;
const LAGGARD_MARGIN = 0.15; // flag anything more than 15% below scope average

type AnimalGain = {
  animalId: string;
  tagId: string;
  penName: string | null;
  intervalGainKg: number;
  previousIsPurchaseWeight: boolean;
};

function fmt(n: number | null, dp = 1) {
  return n === null ? "—" : n.toFixed(dp);
}

function avg(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((s, v) => s + v, 0) / present.length;
}

function computeSessionGains(rows: Row[], sessionIndex: number): AnimalGain[] {
  const out: AnimalGain[] = [];
  for (const row of rows) {
    const current = row.cells[sessionIndex];
    if (current === null) continue;

    let previous: number | null = null;
    for (let i = sessionIndex - 1; i >= 0; i--) {
      if (row.cells[i] !== null) {
        previous = row.cells[i];
        break;
      }
    }
    const previousIsPurchaseWeight = previous === null;
    if (previous === null) previous = row.animal.purchaseWeightKg;

    out.push({
      animalId: row.animal.id,
      tagId: row.animal.tagId,
      penName: row.animal.currentPen?.name ?? null,
      intervalGainKg: current - previous,
      previousIsPurchaseWeight,
    });
  }
  return out;
}

export function WeightStatsClient({ matrix }: { matrix: Matrix }) {
  const { sessions, rows } = matrix;
  const [penFilter, setPenFilter] = useState<string>("all");
  const [sessionId, setSessionId] = useState<string | null>(
    sessions.length > 0 ? sessions[sessions.length - 1].id : null
  );

  const pens = Array.from(
    new Map(
      rows
        .filter((r) => r.animal.currentPen)
        .map((r) => [r.animal.currentPen!.id, r.animal.currentPen!])
    ).values()
  );

  const filteredRows =
    penFilter === "all" ? rows : rows.filter((r) => r.animal.currentPen?.id === penFilter);

  const sessionIndex = sessionId ? sessions.findIndex((s) => s.id === sessionId) : -1;

  const gains = useMemo(
    () => (sessionIndex >= 0 ? computeSessionGains(filteredRows, sessionIndex) : []),
    [filteredRows, sessionIndex]
  );

  const bestPerformer = gains.reduce<AnimalGain | null>(
    (best, g) => (best === null || g.intervalGainKg > best.intervalGainKg ? g : best),
    null
  );
  const worstDrop = gains
    .filter((g) => g.intervalGainKg < 0)
    .reduce<AnimalGain | null>(
      (worst, g) => (worst === null || g.intervalGainKg < worst.intervalGainKg ? g : worst),
      null
    );
  const stagnant = gains.filter((g) => Math.abs(g.intervalGainKg) <= STAGNANT_BAND_KG);
  const averageGainKg = avg(gains.map((g) => g.intervalGainKg));
  const totalActive = filteredRows.length;
  const loggedCount = gains.length;

  const sincePurchaseRows = filteredRows.filter((r) => r.adg.adgSincePurchase !== null);
  const avgAdgSincePurchase = avg(sincePurchaseRows.map((r) => r.adg.adgSincePurchase));
  const bestSincePurchase = sincePurchaseRows.reduce<Row | null>(
    (best, r) =>
      best === null || r.adg.adgSincePurchase! > best.adg.adgSincePurchase! ? r : best,
    null
  );
  const laggards =
    avgAdgSincePurchase === null
      ? []
      : sincePurchaseRows.filter(
          (r) => r.adg.adgSincePurchase! < avgAdgSincePurchase * (1 - LAGGARD_MARGIN)
        );

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No weigh sessions yet.{" "}
        <Link href="/dashboard/weights/new" className="underline underline-offset-2">
          Start one
        </Link>{" "}
        to see stats here.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setPenFilter("all")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              penFilter === "all"
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            Full herd
          </button>
          {pens.map((p) => (
            <button
              key={p.id}
              onClick={() => setPenFilter(p.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                penFilter === p.id
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <select
          value={sessionId ?? ""}
          onChange={(e) => setSessionId(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700"
        >
          {[...sessions]
            .slice()
            .reverse()
            .map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.date).toLocaleDateString("en-KE", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </option>
            ))}
        </select>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">This session</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <p className="text-xs text-zinc-500">Best performer</p>
            {bestPerformer ? (
              <>
                <p className="text-sm font-semibold text-green-600">
                  {bestPerformer.tagId} +{fmt(bestPerformer.intervalGainKg)}kg
                </p>
                <p className="text-xs text-zinc-400">
                  {bestPerformer.penName ?? "—"}
                  {bestPerformer.previousIsPurchaseWeight ? " · vs. purchase weight" : ""}
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-400">No data</p>
            )}
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <p className="text-xs text-zinc-500">Biggest drop</p>
            {worstDrop ? (
              <>
                <p className="text-sm font-semibold text-red-600">
                  {worstDrop.tagId} {fmt(worstDrop.intervalGainKg)}kg
                </p>
                <p className="text-xs text-zinc-400">
                  {worstDrop.penName ?? "—"}
                  {worstDrop.previousIsPurchaseWeight ? " · vs. purchase weight" : ""}
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-500">No weight loss this session</p>
            )}
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <p className="text-xs text-zinc-500">Weighed</p>
            <p
              className={`text-sm font-semibold ${
                loggedCount >= totalActive ? "text-green-600" : "text-amber-600"
              }`}
            >
              {loggedCount}/{totalActive}
            </p>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <p className="text-xs text-zinc-500">Average gain</p>
            <p className="text-sm font-semibold text-zinc-900">{fmt(averageGainKg)}kg</p>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <p className="text-xs text-zinc-500 mb-1">
            Stagnant (±{STAGNANT_BAND_KG}kg since last weigh)
          </p>
          {stagnant.length === 0 ? (
            <p className="text-sm text-zinc-400">None — good sign</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {stagnant.map((g) => (
                <li
                  key={g.animalId}
                  className="rounded-full bg-amber-50 text-amber-700 text-xs px-2 py-1"
                >
                  {g.tagId} ({g.penName ?? "—"})
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">Since purchase</h2>
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <p className="text-xs text-zinc-500">Best performer since purchase</p>
          {bestSincePurchase ? (
            <>
              <p className="text-sm font-semibold text-green-600">
                {bestSincePurchase.animal.tagId} {fmt(bestSincePurchase.adg.adgSincePurchase, 2)}
                kg/day
              </p>
              <p className="text-xs text-zinc-400">
                {bestSincePurchase.animal.currentPen?.name ?? "—"}
              </p>
            </>
          ) : (
            <p className="text-sm text-zinc-400">No data</p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <p className="text-xs text-zinc-500 mb-1">
            Laggards (more than {Math.round(LAGGARD_MARGIN * 100)}% below average)
          </p>
          {laggards.length === 0 ? (
            <p className="text-sm text-zinc-400">None</p>
          ) : (
            <ul className="space-y-1">
              {laggards.map((r) => (
                <li key={r.animal.id} className="text-sm text-red-600">
                  {r.animal.tagId} — {fmt(r.adg.adgSincePurchase, 2)}kg/day{" "}
                  <span className="text-zinc-400">({r.animal.currentPen?.name ?? "—"})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
