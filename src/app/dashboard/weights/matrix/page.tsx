import Link from "next/link";
import { getWeightMatrix } from "@/lib/queries/weights";
import { WeightMatrixClient } from "./WeightMatrixClient";

export const dynamic = "force-dynamic";

export default async function MatrixPage() {
  const matrix = await getWeightMatrix();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-zinc-900">Weighing matrix</h1>
        <Link
          href="/dashboard/weights/stats"
          className="text-sm text-zinc-500 hover:text-zinc-700 underline underline-offset-2"
        >
          View stats →
        </Link>
      </div>
      <WeightMatrixClient matrix={matrix} />
    </div>
  );
}
