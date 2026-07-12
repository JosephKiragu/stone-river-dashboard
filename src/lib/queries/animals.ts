import { db } from "@/lib/db";
import { AnimalStatus } from "@/generated/prisma/client";

export async function listAnimals(filters?: {
  penId?: string;
  status?: AnimalStatus;
}) {
  return db.animal.findMany({
    where: {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.penId
        ? {
            assignments: {
              some: { penId: filters.penId, to: null },
            },
          }
        : {}),
    },
    orderBy: { tagId: "asc" },
    include: {
      assignments: {
        where: { to: null },
        include: { pen: { select: { id: true, name: true } } },
      },
    },
  });
}

export async function getAnimal(id: string) {
  return db.animal.findUnique({
    where: { id },
    include: {
      assignments: {
        orderBy: { from: "desc" },
        include: { pen: { select: { id: true, name: true } } },
      },
    },
  });
}

export async function createAnimal(data: {
  tagId: string;
  breed: string;
  dateOfBirth?: Date;
  purchaseDate: Date;
  purchaseWeightKg: number;
  purchasePriceKes: number;
  penId: string;
}) {
  const { penId, ...animalData } = data;
  return db.$transaction(async (tx) => {
    const animal = await tx.animal.create({ data: animalData });
    await tx.penAssignment.create({
      data: {
        animalId: animal.id,
        penId,
        from: data.purchaseDate,
        to: null,
      },
    });
    return animal;
  });
}

export async function moveAnimalToPen(animalId: string, newPenId: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return db.$transaction(async (tx) => {
    // Close the current open assignment
    await tx.penAssignment.updateMany({
      where: { animalId, to: null },
      data: { to: today },
    });
    // Open new assignment
    await tx.penAssignment.create({
      data: { animalId, penId: newPenId, from: today, to: null },
    });
  });
}

export async function updateAnimalStatus(
  animalId: string,
  data: {
    status: AnimalStatus;
    exitDate?: Date;
    exitWeightKg?: number;
    exitPriceKes?: number;
    exitReason?: string;
  }
) {
  return db.animal.update({ where: { id: animalId }, data });
}
