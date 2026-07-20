import { db } from "@/lib/db";

// ─── Sessions ─────────────────────────────────────────────────────

export async function listWeighSessions() {
  const sessions = await db.weighSession.findMany({
    orderBy: { date: "desc" },
    include: {
      _count: { select: { weightLogs: true } },
    },
  });
  // Known approximation: totalActive is TODAY'S active headcount applied to
  // every session, including historical ones. After sales/deaths, an old
  // session may show e.g. "37/35 weighed". Accepted for MVP-1; a per-session
  // historical denominator would need status-change history we don't track yet.
  const totalActive = await db.animal.count({ where: { status: "ACTIVE" } });
  return sessions.map((s) => ({
    ...s,
    loggedCount: s._count.weightLogs,
    totalActive,
  }));
}

export async function createWeighSession(date: Date, notes?: string) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return db.weighSession.create({ data: { date: d, notes } });
}

export async function getWeighSession(id: string) {
  return db.weighSession.findUnique({
    where: { id },
    include: {
      weightLogs: {
        include: {
          animal: {
            select: {
              id: true,
              tagId: true,
              breed: true,
              purchaseWeightKg: true,
              purchaseDate: true,
              assignments: {
                where: { to: null },
                include: { pen: { select: { id: true, name: true } } },
              },
            },
          },
        },
        orderBy: { animal: { tagId: "asc" } },
      },
    },
  });
}

// ─── Weight logs ──────────────────────────────────────────────────

export async function logWeights(
  entries: { animalId: string; weightKg: number; sessionId: string; loggedAt: Date; notes?: string }[]
) {
  // Upsert: if weight already logged for this animal+date, update it.
  // This is what makes partial sessions (A5) safe to re-open and correct.
  return db.$transaction(
    entries.map((e) => {
      const loggedAt = new Date(e.loggedAt);
      loggedAt.setUTCHours(0, 0, 0, 0);
      return db.weightLog.upsert({
        where: { animalId_loggedAt: { animalId: e.animalId, loggedAt } },
        update: { weightKg: e.weightKg, notes: e.notes ?? null, sessionId: e.sessionId },
        create: {
          animalId: e.animalId,
          weightKg: e.weightKg,
          sessionId: e.sessionId,
          loggedAt,
          notes: e.notes,
        },
      });
    })
  );
}

export async function deleteWeightLog(id: string) {
  return db.weightLog.delete({ where: { id } });
}

// ─── ADG computation ──────────────────────────────────────────────

export type AdgResult = {
  adgOnFeed: number | null; // null until >= 2 logs
  adgSincePurchase: number | null;
  latestWeightKg: number | null;
  logsCount: number;
};

export function computeAdg(
  weightLogs: { weightKg: number; loggedAt: Date }[],
  purchaseWeightKg: number,
  purchaseDate: Date
): AdgResult {
  const sorted = [...weightLogs].sort(
    (a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime()
  );

  const latestWeightKg = sorted.length > 0 ? sorted[sorted.length - 1].weightKg : null;

  // On-feed ADG: first logged weight → latest logged weight
  let adgOnFeed: number | null = null;
  if (sorted.length >= 2) {
    const first = sorted[0];
    const latest = sorted[sorted.length - 1];
    const days =
      (new Date(latest.loggedAt).getTime() - new Date(first.loggedAt).getTime()) /
      86_400_000;
    adgOnFeed = days > 0 ? (latest.weightKg - first.weightKg) / days : null;
  }

  // Since-purchase ADG: purchase weight → latest logged weight
  let adgSincePurchase: number | null = null;
  if (latestWeightKg !== null) {
    const daysOnLot =
      (new Date(sorted[sorted.length - 1].loggedAt).getTime() -
        new Date(purchaseDate).getTime()) /
      86_400_000;
    adgSincePurchase =
      daysOnLot > 0 ? (latestWeightKg - purchaseWeightKg) / daysOnLot : null;
  }

  return { adgOnFeed, adgSincePurchase, latestWeightKg, logsCount: sorted.length };
}

// ─── Animals ready to weigh in a session ─────────────────────────

export async function getAnimalsForSession(sessionId: string) {
  // All active animals + their weight log for this session (null if not yet weighed)
  const [animals, session] = await Promise.all([
    db.animal.findMany({
      where: { status: "ACTIVE" },
      orderBy: { tagId: "asc" },
      include: {
        assignments: {
          where: { to: null },
          include: { pen: { select: { id: true, name: true } } },
        },
        // NOTE: ordered DESC — weightLogs[0] is the MOST RECENT log.
        // The client reads index 0 for the "last weight" hint. Do not change
        // the sort order or the client index independently of each other.
        weightLogs: {
          orderBy: { loggedAt: "desc" },
          take: 2,
          select: { weightKg: true, loggedAt: true },
        },
      },
    }),
    db.weighSession.findUnique({
      where: { id: sessionId },
      include: {
        weightLogs: { select: { animalId: true, weightKg: true, id: true } },
      },
    }),
  ]);

  if (!session) return null;

  const loggedMap = new Map(
    session.weightLogs.map((l) => [l.animalId, { weightKg: l.weightKg, id: l.id }])
  );

  return {
    session,
    animals: animals.map((a) => ({
      ...a,
      loggedEntry: loggedMap.get(a.id) ?? null,
      currentPen: a.assignments[0]?.pen ?? null,
    })),
  };
}

// ─── Weight matrix ─────────────────────────────────────────────────

export async function getWeightMatrix() {
  const [animals, sessions] = await Promise.all([
    db.animal.findMany({
      where: { status: "ACTIVE" },
      orderBy: { tagId: "asc" },
      include: {
        weightLogs: { orderBy: { loggedAt: "asc" } },
        assignments: {
          where: { to: null },
          include: { pen: { select: { id: true, name: true } } },
        },
      },
    }),
    db.weighSession.findMany({ orderBy: { date: "asc" } }),
  ]);

  const sessionIds = sessions.map((s) => s.id);

  return {
    sessions,
    rows: animals.map((a) => {
      const logsBySession = new Map(
        a.weightLogs
          .filter((l) => l.sessionId)
          .map((l) => [l.sessionId!, l.weightKg])
      );
      const adg = computeAdg(a.weightLogs, a.purchaseWeightKg, a.purchaseDate);

      // Most recent interval gain — the two latest logs, whatever the actual
      // gap between them is (weekly cadence in practice, but not enforced).
      let lastIntervalGainKg: number | null = null;
      if (a.weightLogs.length >= 2) {
        const prev = a.weightLogs[a.weightLogs.length - 2];
        const latest = a.weightLogs[a.weightLogs.length - 1];
        lastIntervalGainKg = latest.weightKg - prev.weightKg;
      }

      const totalGainSincePurchaseKg =
        adg.latestWeightKg !== null ? adg.latestWeightKg - a.purchaseWeightKg : null;

      return {
        animal: {
          id: a.id,
          tagId: a.tagId,
          breed: a.breed,
          purchaseWeightKg: a.purchaseWeightKg,
          purchaseDate: a.purchaseDate,
          currentPen: a.assignments[0]?.pen ?? null,
        },
        cells: sessionIds.map((sid) => logsBySession.get(sid) ?? null),
        adg,
        lastIntervalGainKg,
        totalGainSincePurchaseKg,
      };
    }),
  };
}
