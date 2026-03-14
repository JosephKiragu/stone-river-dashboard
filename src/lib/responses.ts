import { NextResponse } from 'next/server';

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function forbidden(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function badRequest(message: string, field?: string) {
  return NextResponse.json(
    field ? { error: message, field } : { error: message },
    { status: 400 }
  );
}

export function tooManyRequests() {
  return NextResponse.json(
    { error: 'Too many requests. Try again later.' },
    { status: 429 }
  );
}
