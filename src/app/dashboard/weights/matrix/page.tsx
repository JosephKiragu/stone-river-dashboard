import { getWeightMatrix } from "@/lib/queries/weights";
import { WeightMatrixClient } from "./WeightMatrixClient";

export default async function MatrixPage() {
  const matrix = await getWeightMatrix();
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-zinc-900">Weighing matrix</h1>
      <WeightMatrixClient matrix={matrix} />
    </div>
  );
}
