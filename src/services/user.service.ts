import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { getResendClient } from '@/lib/resend';

export type CreateWorkerInput = {
  name: string;
  email: string;
  password: string;
};

export type UpdateWorkerInput = {
  name?: string;
  email?: string;
  password?: string;
};

export type UpdateSelfInput = {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
};

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createWorker(input: CreateWorkerInput) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: 'WORKER',
      isActive: true,
    },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  return user;
}

export async function updateWorker(id: string, input: UpdateWorkerInput) {
  if (!input.name && !input.email && !input.password) {
    throw Object.assign(new Error('At least one field is required'), {
      code: 'BAD_REQUEST',
    });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
  }
  if (target.role === 'OWNER') {
    throw Object.assign(new Error('Cannot modify another OWNER'), {
      code: 'FORBIDDEN',
    });
  }

  const updateData: {
    name?: string;
    email?: string;
    passwordHash?: string;
  } = {};
  if (input.name) updateData.name = input.name;
  if (input.email) updateData.email = input.email;
  if (input.password) updateData.passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  return user;
}

export async function deactivateWorker(id: string) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
  }
  if (target.role === 'OWNER') {
    throw Object.assign(new Error('Cannot deactivate an OWNER'), {
      code: 'FORBIDDEN',
    });
  }

  const user = await prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, isActive: true },
  });
  return user;
}

export async function updateSelf(userId: string, input: UpdateSelfInput) {
  if (!input.name && !input.email && !input.newPassword) {
    throw Object.assign(new Error('At least one field is required'), {
      code: 'BAD_REQUEST',
    });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
  }

  if (input.newPassword) {
    if (!input.currentPassword) {
      throw Object.assign(new Error('Current password is required'), {
        code: 'BAD_REQUEST',
      });
    }
    const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!valid) {
      throw Object.assign(new Error('Current password is incorrect'), {
        code: 'BAD_REQUEST',
      });
    }
  }

  const updateData: {
    name?: string;
    email?: string;
    passwordHash?: string;
  } = {};
  if (input.name) updateData.name = input.name;
  if (input.email) updateData.email = input.email;
  if (input.newPassword) {
    updateData.passwordHash = await bcrypt.hash(input.newPassword, 12);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: { id: true, name: true, email: true },
  });
  return updated;
}

export async function forgotPassword(email: string): Promise<void> {
  // Guard RESEND_FROM_EMAIL BEFORE any DB query — ensures uniform response
  // regardless of whether the email exists (anti-enumeration fix).
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!fromEmail) {
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return;
  }

  const rawToken = crypto.randomUUID();
  const tokenHash = hashToken(rawToken);
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: tokenHash,
      expires,
    },
  });

  const resetUrl = `${process.env.NEXTAUTH_URL ?? ''}/reset-password?token=${rawToken}`;

  // Lazy-initialize Resend inside this method only — no module-level throw
  const resend = getResendClient();
  await resend.emails.send({
    from: fromEmail,
    to: email,
    subject: 'Reset your password',
    html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>`,
  });
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(rawToken);

  // Find token first to get the associated email (identifier)
  const tokenRecord = await prisma.verificationToken.findFirst({
    where: {
      token: tokenHash,
      expires: { gt: new Date() },
    },
  });

  if (!tokenRecord) {
    throw Object.assign(new Error('Invalid or expired reset link.'), {
      code: 'BAD_REQUEST',
    });
  }

  // TOCTOU fix: delete first using deleteMany, proceed only if count > 0
  const deleted = await prisma.verificationToken.deleteMany({
    where: {
      token: tokenHash,
      identifier: tokenRecord.identifier,
    },
  });

  if (deleted.count === 0) {
    throw Object.assign(new Error('Invalid or expired reset link.'), {
      code: 'BAD_REQUEST',
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { email: tokenRecord.identifier },
    data: { passwordHash },
  });
}
