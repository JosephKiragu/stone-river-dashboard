import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AnimalStatus } from "@/generated/prisma/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const animal = await db.animal.findUnique({
    where: { id },
    include: {
      assignments: {
        orderBy: { from: "desc" },
        include: { pen: { select: { id: true, name: true } } },
      },
    },
  });
  if (!animal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(animal);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { penId, status, exitDate, exitWeightKg, exitPriceKes, exitReason } = body;

  // Pen move
  if (penId) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await db.$transaction(async (tx) => {
      await tx.penAssignment.updateMany({
        where: { animalId: id, to: null },
        data: { to: today },
      });
      await tx.penAssignment.create({
        data: { animalId: id, penId, from: today, to: null },
      });
    });
  }

  // Status update
  if (status) {
    const validStatus = Object.values(AnimalStatus).includes(status as AnimalStatus);
    if (!validStatus) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    await db.animal.update({
      where: { id },
      data: {
        status: status as AnimalStatus,
        ...(exitDate ? { exitDate: new Date(exitDate) } : {}),
        ...(exitWeightKg !== undefined ? { exitWeightKg: parseFloat(exitWeightKg) } : {}),
        ...(exitPriceKes !== undefined ? { exitPriceKes: parseFloat(exitPriceKes) } : {}),
        ...(exitReason ? { exitReason } : {}),
      },
    });
  }

  const updated = await db.animal.findUnique({ where: { id } });
  return NextResponse.json(updated);
}
