"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Props = { data: { date: string; weightKg: number }[] };

export default function WeightChart({ data }: Props) {
  if (data.length < 2) return null; // no chart until 2+ points

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <p className="text-xs font-medium text-zinc-500 mb-2">Weight over time</p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            tickFormatter={(v: string) => v.slice(5)} // MM-DD
          />
          <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
          <Tooltip
            formatter={(v) => [`${Number(v).toFixed(1)} kg`, "Weight"]}
            labelFormatter={(l) => l}
          />
          <Line
            type="monotone"
            dataKey="weightKg"
            stroke="#18181b"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
