import { Resend } from 'resend';

export function getResendClient(): Resend {
  return new Resend(process.env.RESEND_API_KEY);
}
