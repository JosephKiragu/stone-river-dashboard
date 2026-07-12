"use client";

import { useRouter } from "next/navigation";

interface Pen {
  id: string;
  name: string;
}

interface AnimalFiltersProps {
  pens: Pen[];
  currentPenId?: string;
  currentStatus?: string;
}

export function AnimalFilters({
  pens,
  currentPenId,
  currentStatus,
}: AnimalFiltersProps) {
  const router = useRouter();

  function buildUrl(penId?: string, status?: string) {
    const params = new URLSearchParams();
    if (penId) params.set("penId", penId);
    if (status) params.set("status", status);
    const qs = params.toString();
    return `/dashboard/animals${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex gap-2">
      <select
        value={currentPenId ?? ""}
        onChange={(e) =>
          router.push(buildUrl(e.target.value || undefined, currentStatus))
        }
        className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      >
        <option value="">All pens</option>
        {pens.map((pen) => (
          <option key={pen.id} value={pen.id}>
            {pen.name}
          </option>
        ))}
      </select>
      <select
        value={currentStatus ?? ""}
        onChange={(e) =>
          router.push(buildUrl(currentPenId, e.target.value || undefined))
        }
        className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      >
        <option value="">All statuses</option>
        <option value="ACTIVE">Active</option>
        <option value="SOLD">Sold</option>
        <option value="DEAD">Dead</option>
        <option value="LOSS">Loss</option>
      </select>
    </div>
  );
}
