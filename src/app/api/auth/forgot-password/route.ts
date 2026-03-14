import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { forgotPassword } from '@/services/user.service';
import { createRatelimit } from '@/lib/ratelimit';
import { tooManyRequests } from '@/lib/responses';

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const limiter = createRatelimit(5, '15 m');
  const { success } = await limiter.limit(ip);
  if (!success) {
    return tooManyRequests();
  }

  const body: unknown = await request.json();
  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid email address.' },
      { status: 400 }
    );
  }

  try {
    await forgotPassword(result.data.email);
  } catch {
    return NextResponse.json(
      { error: 'Failed to send email. Try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { message: 'If that email exists, a reset link has been sent.' },
    { status: 200 }
  );
}
