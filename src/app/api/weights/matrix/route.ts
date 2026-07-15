import { NextResponse } from "next/server";
import { getWeightMatrix } from "@/lib/queries/weights";

export async function GET() {
  const matrix = await getWeightMatrix();
  return NextResponse.json(matrix);
}
