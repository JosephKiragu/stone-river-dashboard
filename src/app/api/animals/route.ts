import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AnimalStatus, Prisma } from "@/generated/prisma/client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const penId = searchParams.get("penId") ?? undefined;
  const statusRaw = searchParams.get("status") ?? undefined;
  const status =
    statusRaw && Object.values(AnimalStatus).includes(statusRaw as AnimalStatus)
      ? (statusRaw as AnimalStatus)
      : undefined;

  const animals = await db.animal.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(penId
        ? { assignments: { some: { penId, to: null } } }
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
  return NextResponse.json(animals);
}

export async function POST(request: Request) {
  const body = await request.json();
  const {
    tagId,
    breed,
    ageAtPurchaseMonths,
    purchaseDate,
    purchaseWeightKg,
    purchasePriceKes,
    purchaseMarket,
    penId,
  } = body;

  if (!tagId || !breed || !purchaseDate || !purchaseWeightKg || !purchasePriceKes || !penId) {
    return NextResponse.json(
      { error: "tagId, breed, purchaseDate, purchaseWeightKg, purchasePriceKes, penId are required" },
      { status: 400 }
    );
  }

  try {
    const animal = await db.$transaction(async (tx) => {
      const a = await tx.animal.create({
        data: {
          tagId,
          breed,
          ageAtPurchaseMonths:
            ageAtPurchaseMonths != null
              ? Number.parseInt(String(ageAtPurchaseMonths), 10)
              : undefined,
          purchaseDate: new Date(purchaseDate),
          purchaseWeightKg: parseFloat(purchaseWeightKg),
          purchasePriceKes: parseFloat(purchasePriceKes),
          purchaseMarket: purchaseMarket ?? undefined,
        },
      });
      await tx.penAssignment.create({
        data: {
          animalId: a.id,
          penId,
          from: new Date(purchaseDate),
          to: null,
        },
      });
      return a;
    });
    return NextResponse.json(animal, { status: 201 });
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json({ error: "Tag ID already exists" }, { status: 409 });
    }
    throw err;
  }
}
