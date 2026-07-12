import { db } from "@/lib/db";

export async function listPens() {
  const pens = await db.pen.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    include: {
      assignments: {
        where: { to: null },
        select: { id: true },
      },
    },
  });
  return pens.map((p) => ({
    ...p,
    activeHeadCount: p.assignments.length,
  }));
}

export async function getPenWithAnimals(id: string) {
  return db.pen.findUnique({
    where: { id },
    include: {
      assignments: {
        where: { to: null },
        include: {
          animal: {
            select: {
              id: true,
              tagId: true,
              breed: true,
              purchaseDate: true,
              purchaseWeightKg: true,
              status: true,
            },
          },
        },
      },
    },
  });
}

export async function createPen(data: { name: string; capacity?: number }) {
  return db.pen.create({ data });
}

export async function updatePen(
  id: string,
  data: { name?: string; capacity?: number; isActive?: boolean }
) {
  return db.pen.update({ where: { id }, data });
}
