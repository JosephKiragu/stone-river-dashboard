"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Pen = { id: string; name: string };
type AnimalRow = {
  id: string;
  tagId: string;
  breed: string;
  purchaseWeightKg: number;
  currentPen: Pen | null;
  loggedEntry: { weightKg: number; id: string } | null;
  // Ordered DESC by the API — index 0 is the MOST RECENT log
  weightLogs: { weightKg: number; loggedAt: string }[];
};
type SessionData = {
  session: { id: string; date: string; notes: string | null };
  animals: AnimalRow[];
};

export default function WeighSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [data, setData] = useState<SessionData | null>(null);
  const [entries, setEntries] = useState<Record<string, string>>({}); // animalId → weight string
  const [filter, setFilter] = useState<string>("all"); // penId or "all"
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    params.then(({ id }) => {
      if (cancelled) return;
      setSessionId(id);
      fetch(`/api/weigh-sessions/${id}/animals`)
        .then((r) => {
          if (!r.ok) throw new Error("load failed");
          return r.json();
        })
        .then((d: SessionData) => {
          if (cancelled) return;
          setData(d);
          // Pre-fill already logged entries
          const pre: Record<string, string> = {};
          d.animals.forEach((a) => {
            if (a.loggedEntry) pre[a.id] = String(a.loggedEntry.weightKg);
          });
          setEntries(pre);
        })
        .catch(() => {
          if (!cancelled) setError("Could not load session. Refresh to retry.");
        });
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  if (!data || !sessionId) {
    return (
      <div className="p-4 space-y-2">
        {error ? (
          <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Loading...</p>
        )}
      </div>
    );
  }

  const pens = Array.from(
    new Map(
      data.animals
        .filter((a) => a.currentPen)
        .map((a) => [a.currentPen!.id, a.currentPen!])
    ).values()
  );

  const filtered =
    filter === "all"
      ? data.animals
      : data.animals.filter((a) => a.currentPen?.id === filter);

  const loggedCount = data.animals.filter(
    (a) => a.loggedEntry || (entries[a.id] && entries[a.id] !== "")
  ).length;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const payload = Object.entries(entries)
      .filter(([, v]) => v !== "" && !isNaN(parseFloat(v)))
      .map(([animalId, weightKg]) => ({
        animalId,
        weightKg: parseFloat(weightKg),
        sessionId,
        loggedAt: data!.session.date,
      }));

    if (payload.length === 0) {
      setError("No weights entered.");
      setSaving(false);
      return;
    }

    const res = await fetch("/api/weights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: payload }),
    });

    if (!res.ok) {
      setError("Save failed. Try again.");
    } else {
      router.refresh();
      router.push(`/dashboard/weights`);
    }
    setSaving(false);
  }

  const sessionDate = new Date(data.session.date).toLocaleDateString("en-KE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/weights" className="text-xs text-zinc-400 hover:text-zinc-600">
          ← Weigh sessions
        </Link>
        <h1 className="text-lg font-bold text-zinc-900 mt-1">{sessionDate}</h1>
        <p className="text-sm text-zinc-500">
          {loggedCount} of {data.animals.length} weighed
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Pen filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            filter === "all"
              ? "bg-zinc-900 text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          All pens
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

      {/* Animal rows — unweighed first */}
      <div className="space-y-2">
        {[
          ...filtered.filter((a) => !a.loggedEntry),
          ...filtered.filter((a) => a.loggedEntry),
        ].map((animal) => {
          // weightLogs is DESC-ordered: [0] is the most recent prior log.
          // Do NOT read the last index — that is the OLDER of the two returned logs.
          const lastWeight =
            animal.weightLogs.length > 0
              ? animal.weightLogs[0].weightKg
              : animal.purchaseWeightKg;
          const isLogged = !!animal.loggedEntry;

          return (
            <div
              key={animal.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                isLogged
                  ? "border-green-200 bg-green-50"
                  : "border-zinc-200 bg-white"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900">{animal.tagId}</p>
                <p className="text-xs text-zinc-500">
                  {animal.currentPen?.name ?? "—"} · last {lastWeight} kg
                </p>
              </div>
              <input
                type="number"
                step="0.5"
                min="0"
                inputMode="decimal"
                placeholder="kg"
                value={entries[animal.id] ?? ""}
                onChange={(e) =>
                  setEntries((prev) => ({ ...prev, [animal.id]: e.target.value }))
                }
                className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-right focus:border-zinc-500 focus:outline-none"
              />
            </div>
          );
        })}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save weights"}
      </button>
    </div>
  );
}
