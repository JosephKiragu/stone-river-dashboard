"use client";

import dynamic from "next/dynamic";

const WeightChart = dynamic(() => import("./WeightChart"), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <p className="text-xs text-zinc-400">Loading chart…</p>
    </div>
  ),
});

type Props = { data: { date: string; weightKg: number }[] };

export function WeightChartClient({ data }: Props) {
  return <WeightChart data={data} />;
}
