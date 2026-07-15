import { db } from "@/lib/db";

export async function GET() {
  const logs = await db.weightLog.findMany({
    orderBy: [{ loggedAt: "desc" }, { animal: { tagId: "asc" } }],
    include: {
      animal: { select: { tagId: true, breed: true } },
      session: { select: { date: true } },
    },
  });

  const headers = ["logId", "tagId", "breed", "weightKg", "loggedAt", "sessionDate", "notes"];
  const rows = logs.map((l) => [
    l.id,
    l.animal.tagId,
    l.animal.breed,
    l.weightKg,
    l.loggedAt.toISOString().slice(0, 10),
    l.session?.date.toISOString().slice(0, 10) ?? "",
    l.notes ?? "",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="weights-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
