import { db } from "@/lib/db";

export async function GET() {
  const pens = await db.pen.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      assignments: { where: { to: null }, select: { id: true } },
    },
  });

  const headers = ["id", "name", "capacity", "isActive", "activeHeadCount", "createdAt"];
  const rows = pens.map((p) => [
    p.id,
    p.name,
    p.capacity ?? "",
    p.isActive,
    p.assignments.length,
    p.createdAt.toISOString().split("T")[0],
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="pens-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
