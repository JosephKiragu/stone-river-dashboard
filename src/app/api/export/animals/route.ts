import { db } from "@/lib/db";

export async function GET() {
  const animals = await db.animal.findMany({
    orderBy: { tagId: "asc" },
    include: {
      assignments: {
        where: { to: null },
        include: { pen: { select: { name: true } } },
      },
    },
  });

  const headers = [
    "tagId",
    "breed",
    "status",
    "dateOfBirth",
    "purchaseDate",
    "purchaseWeightKg",
    "purchasePriceKes",
    "currentPen",
    "exitDate",
    "exitWeightKg",
    "exitPriceKes",
    "exitReason",
  ];

  const rows = animals.map((a) => [
    a.tagId,
    a.breed,
    a.status,
    a.dateOfBirth ? a.dateOfBirth.toISOString().split("T")[0] : "",
    a.purchaseDate.toISOString().split("T")[0],
    a.purchaseWeightKg,
    a.purchasePriceKes,
    a.assignments[0]?.pen?.name ?? "",
    a.exitDate ? a.exitDate.toISOString().split("T")[0] : "",
    a.exitWeightKg ?? "",
    a.exitPriceKes ?? "",
    a.exitReason ?? "",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="animals-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
