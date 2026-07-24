import { getWeightMatrix } from "@/lib/queries/weights";
import { WeightStatsClient } from "./WeightStatsClient";

export const dynamic = "force-dynamic";

export default async function WeightStatsPage() {
  const matrix = await getWeightMatrix();
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-zinc-900">Weigh session stats</h1>
      <WeightStatsClient matrix={matrix} />
    </div>
  );
}
