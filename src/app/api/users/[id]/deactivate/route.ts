import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { deactivateWorker } from '@/services/user.service';
import { unauthorized, forbidden, notFound } from '@/lib/responses';

export async function PATCH(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return unauthorized();
  }
  if (session.user.role !== 'OWNER') {
    return forbidden('Forbidden');
  }

  try {
    const result = await deactivateWorker(params.id);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const error = err as { code?: string; message?: string };
    if (error.code === 'NOT_FOUND') {
      return notFound('User not found');
    }
    if (error.code === 'FORBIDDEN') {
      return forbidden(error.message ?? 'Forbidden');
    }
    throw err;
  }
}
