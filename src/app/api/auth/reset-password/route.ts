import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resetPassword } from '@/services/user.service';
import { createRatelimit } from '@/lib/ratelimit';
import { tooManyRequests } from '@/lib/responses';

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const limiter = createRatelimit(10, '15 m');
  const { success } = await limiter.limit(ip);
  if (!success) {
    return tooManyRequests();
  }

  const body: unknown = await request.json();
  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid or expired reset link.' },
      { status: 400 }
    );
  }

  try {
    await resetPassword(result.data.token, result.data.password);
  } catch (err) {
    const error = err as { code?: string; message?: string };
    if (error.code === 'BAD_REQUEST') {
      return NextResponse.json(
        { error: error.message ?? 'Invalid or expired reset link.' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Invalid or expired reset link.' },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { message: 'Password updated. Please log in.' },
    { status: 200 }
  );
}
