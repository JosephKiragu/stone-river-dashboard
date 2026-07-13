import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeonHttp } from "@prisma/adapter-neon";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  // PrismaNeonHttp uses the Neon HTTP transport instead of WebSocket Pool.
  // Required for Vercel Node.js 20 (no native WebSocket; ws pkg not installed).
  // PrismaNeon (WebSocket Pool) silently fails on Node 20 without a wsConstructor.
  const adapter = new PrismaNeonHttp(process.env.DATABASE_URL!, {});
  return new PrismaClient({ adapter });
}

export const db: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
