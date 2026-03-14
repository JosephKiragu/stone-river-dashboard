import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { createWorker } from '@/services/user.service';
import { unauthorized, forbidden, badRequest } from '@/lib/responses';

const createWorkerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return unauthorized();
  }
  if (session.user.role !== 'OWNER') {
    return forbidden('Forbidden');
  }

  const body: unknown = await request.json();
  const result = createWorkerSchema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    return badRequest(issue?.message ?? 'Validation error', issue?.path[0] as string | undefined);
  }

  try {
    const user = await createWorker(result.data);
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    const error = err as { code?: string; meta?: { target?: string[] } };
    // Prisma unique constraint violation
    if (
      error.code === 'P2002' ||
      (error as { code?: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Email already in use' },
        { status: 409 }
      );
    }
    throw err;
  }
}
