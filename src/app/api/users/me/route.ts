import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { updateSelf } from '@/services/user.service';
import { unauthorized, badRequest } from '@/lib/responses';

const updateSelfSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return unauthorized();
  }

  const body: unknown = await request.json();
  const result = updateSelfSchema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    return badRequest(issue?.message ?? 'Validation error', issue?.path[0] as string | undefined);
  }

  try {
    const user = await updateSelf(session.user.id, result.data);
    return NextResponse.json(user, { status: 200 });
  } catch (err) {
    const error = err as { code?: string; message?: string };
    if (error.code === 'BAD_REQUEST') {
      return badRequest(error.message ?? 'Bad request');
    }
    // Prisma unique constraint violation (email conflict)
    const prismaErr = err as { code?: string };
    if (prismaErr.code === 'P2002') {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }
    throw err;
  }
}
