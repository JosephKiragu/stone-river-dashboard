# DROVER — M2 Spec: Weights & ADG
Version: 2.0 (rev 2 — corrected)
Date: 2026-07-13
Milestone: M2 — Weights & ADG
Repo root: /Users/josephkiragu/dev/dashboard/ (CONFIRMED — this is the live repo; forge/dashboard does not exist)

---

## MANDATORY: Read these files first

```bash
cat prisma/schema.prisma
cat src/lib/db.ts
cat src/lib/queries/animals.ts
cat src/lib/queries/pens.ts
cat src/app/dashboard/animals/page.tsx
cat src/app/dashboard/animals/[id]/page.tsx
cat src/app/dashboard/pens/page.tsx
cat src/components/Nav.tsx
```

**After reading `prisma/schema.prisma`: confirm the Prisma client generator `output`
path.** This spec assumes generated types import from `@/generated/prisma/client`.
If M0/M1 established a different path (including the default `@prisma/client`), use
that path for ALL Prisma type imports in this spec (`Prisma`). Do not change the
generator config to match this spec — the spec conforms to the repo.

---

## Context

DROVER is a feedlot management dashboard. M1 delivered pens and animal registration.
M2 adds weekly weight logging and ADG computation — the feedlot heartbeat.

**What already exists (do NOT re-implement):**
- `Pen`, `Animal`, `PenAssignment`, `AnimalStatus`, `AppSettings` in schema.prisma
- `src/lib/db.ts` — PrismaNeon adapter + ws (interactive transactions work)
- `src/lib/queries/pens.ts` — listPens, getPenWithAnimals, createPen
- `src/lib/queries/animals.ts` — listAnimals, getAnimal, createAnimal, moveAnimalToPen, updateAnimalStatus
- `/dashboard/pens`, `/dashboard/animals`, `/dashboard/animals/new`, `/dashboard/animals/[id]`
- Auth middleware in `src/proxy.ts` (Next.js 16: file is proxy.ts, export is `proxy`)
- Nav in `src/components/Nav.tsx`

**Pattern to follow:**
- Server Components by default (no `"use client"` unless absolutely necessary)
- Recharts: quarantined behind `next/dynamic` with `ssr: false` — see section 16/16b for
  the EXACT required pattern (whole-chart dynamic import, NOT per-component)
- Server actions for forms with `"use server"` at the top of the action function
- Queries in `src/lib/queries/<module>.ts`; API routes in `src/app/api/<module>/route.ts`
- All dates stored as UTC midnight (`new Date(dateStr)` then `setUTCHours(0,0,0,0)`)
- Tailwind CSS v4 for all styling
- Unique-constraint violations detected via `Prisma.PrismaClientKnownRequestError` and
  `err.code === "P2002"` — NEVER by string-matching error messages

**Field naming:** The schema uses `animalId` (not `cowId`). Match exactly.

**Critical gotchas (do not re-investigate):**
- `.env.local` contains a bcrypt hash with escaped `$` characters — NEVER `source`
  that file in bash. Extract individual vars with grep (see schema-push command below).
- This repo does NOT use Prisma Migrate. There is no `prisma/migrations/` directory and
  no `_prisma_migrations` table. Schema changes are applied with `prisma db push` against
  the direct (non-pooled) Neon URL. Do NOT run `prisma migrate dev` — drift detection
  will offer to reset the database, destroying M1 data. Do NOT create a migrations
  directory.

---

## Database / Data sources

### New tables — add to prisma/schema.prisma

```prisma
model WeighSession {
  id         String      @id @default(cuid())
  createdAt  DateTime    @default(now())
  date       DateTime    @unique // one session per weigh day; UTC midnight
  notes      String?
  weightLogs WeightLog[]
}

model WeightLog {
  id        String        @id @default(cuid())
  createdAt DateTime      @default(now())
  animalId  String
  animal    Animal        @relation(fields: [animalId], references: [id])
  sessionId String?
  session   WeighSession? @relation(fields: [sessionId], references: [id])
  weightKg  Float
  loggedAt  DateTime      // weigh day — UTC midnight; matches WeighSession.date
  notes     String?

  @@unique([animalId, loggedAt])
  @@index([animalId, loggedAt])
}
```

### Update Animal model — add relation

In the existing `Animal` model, add:
```prisma
  weightLogs  WeightLog[]
```

Do NOT modify anything else in the Animal model. Do NOT modify the generator block.

### Schema push (NOT migrate)

After editing schema.prisma, apply with the same pattern M0/M1 used — direct URL
extracted with grep, never `source`:

```bash
DATABASE_URL="$(grep '^DIRECT_URL=' .env.local | cut -d= -f2- | tr -d '"')" npx prisma db push
npx prisma generate
```

---

## Required Changes

### 1. `prisma/schema.prisma`

- Add `WeighSession` model (above)
- Add `WeightLog` model (above)
- Add `weightLogs WeightLog[]` to the `Animal` model

### 2. `src/lib/queries/weights.ts` (NEW FILE)

```typescript
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
  adgOnFeed: number | null;   // null until >= 2 logs
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
      };
    }),
  };
}
```

### 3. `src/app/api/weigh-sessions/route.ts` (NEW FILE)

```typescript
import { NextResponse } from "next/server";
import { listWeighSessions, createWeighSession } from "@/lib/queries/weights";
import { Prisma } from "@/generated/prisma/client"; // adjust to the repo's generator output path

export async function GET() {
  const sessions = await listWeighSessions();
  return NextResponse.json(sessions);
}

export async function POST(req: Request) {
  const { date, notes } = await req.json();
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });
  try {
    const session = await createWeighSession(new Date(date), notes);
    return NextResponse.json(session, { status: 201 });
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A session already exists for this date" },
        { status: 409 }
      );
    }
    throw err;
  }
}
```

### 4. `src/app/api/weigh-sessions/[id]/route.ts` (NEW FILE)

```typescript
import { NextResponse } from "next/server";
import { getWeighSession } from "@/lib/queries/weights";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getWeighSession(id);
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(session);
}
```

### 5. `src/app/api/weights/route.ts` (NEW FILE)

```typescript
import { NextResponse } from "next/server";
import { logWeights } from "@/lib/queries/weights";

export async function POST(req: Request) {
  const body = await req.json();
  // body: { entries: [{ animalId, weightKg, sessionId, loggedAt, notes? }] }
  const { entries } = body;
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "entries array required" }, { status: 400 });
  }
  const logs = await logWeights(
    entries.map((e: { animalId: string; weightKg: number; sessionId: string; loggedAt: string; notes?: string }) => ({
      ...e,
      loggedAt: new Date(e.loggedAt),
    }))
  );
  return NextResponse.json(logs, { status: 201 });
}
```

### 6. `src/app/api/weights/[id]/route.ts` (NEW FILE)

```typescript
import { NextResponse } from "next/server";
import { deleteWeightLog } from "@/lib/queries/weights";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteWeightLog(id);
  return NextResponse.json({ ok: true });
}
```

### 7. `src/app/api/weights/matrix/route.ts` (NEW FILE)

```typescript
import { NextResponse } from "next/server";
import { getWeightMatrix } from "@/lib/queries/weights";

export async function GET() {
  const matrix = await getWeightMatrix();
  return NextResponse.json(matrix);
}
```

### 8. `src/app/api/export/weights/route.ts` (NEW FILE)

Uses the same quote-escape CSV pattern as M1's export routes — every field quoted,
embedded quotes doubled. Do not join bare values with commas.

```typescript
import { db } from "@/lib/db";

export async function GET() {
  const logs = await db.weightLog.findMany({
    orderBy: [{ loggedAt: "desc" }, { animal: { tagId: "asc" } }],
    include: {
      animal: { select: { tagId: true, breed: true } },
      session: { select: { date: true } },
    },
  });

  const headers = ["logId", "tagId", "breed", "weightKg", "loggedAt", "sessionDate", "notes"];
  const rows = logs.map((l) => [
    l.id,
    l.animal.tagId,
    l.animal.breed,
    l.weightKg,
    l.loggedAt.toISOString().slice(0, 10),
    l.session?.date.toISOString().slice(0, 10) ?? "",
    l.notes ?? "",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="weights-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
```

### 9. `src/app/dashboard/weights/page.tsx` (NEW FILE)

Server component. Lists all weigh sessions.

```typescript
import Link from "next/link";
import { listWeighSessions } from "@/lib/queries/weights";

export default async function WeightsPage() {
  const sessions = await listWeighSessions();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-zinc-900">Weigh sessions</h1>
        <Link
          href="/dashboard/weights/new"
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
        >
          + New session
        </Link>
      </div>

      {sessions.length === 0 && (
        <p className="text-sm text-zinc-500">No weigh sessions yet. Start one above.</p>
      )}

      <ul className="space-y-2">
        {sessions.map((s) => (
          <li key={s.id}>
            <Link
              href={`/dashboard/weights/${s.id}`}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:bg-zinc-50 transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  {new Date(s.date).toLocaleDateString("en-KE", {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                {s.notes && <p className="text-xs text-zinc-500 mt-0.5">{s.notes}</p>}
              </div>
              <div className="text-right">
                <span
                  className={`text-sm font-medium ${
                    s.loggedCount >= s.totalActive ? "text-green-600" : "text-amber-600"
                  }`}
                >
                  {s.loggedCount}/{s.totalActive} weighed
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="pt-2">
        <Link
          href="/dashboard/weights/matrix"
          className="text-sm text-zinc-500 hover:text-zinc-700 underline underline-offset-2"
        >
          View weighing matrix →
        </Link>
      </div>
    </div>
  );
}
```

### 10. `src/app/dashboard/weights/new/page.tsx` (NEW FILE)

Server component with server action to create a session.

**Do not restructure the try/catch below.** The redirect() call inside the catch
throws NEXT_REDIRECT by design; the final `throw err` re-throws everything that is
not a P2002 — that is correct Next.js behaviour, not a bug to fix.

```typescript
import Link from "next/link";
import { createWeighSession } from "@/lib/queries/weights";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client"; // adjust to the repo's generator output path

export default async function NewWeighSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function handleCreate(formData: FormData) {
    "use server";
    const dateRaw = formData.get("date") as string;
    const notes = (formData.get("notes") as string)?.trim() || undefined;

    if (!dateRaw) {
      redirect("/dashboard/weights/new?error=Date%20is%20required");
    }

    let session: { id: string };
    try {
      session = await createWeighSession(new Date(dateRaw), notes);
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        redirect("/dashboard/weights/new?error=A%20session%20already%20exists%20for%20this%20date");
      }
      throw err;
    }
    redirect(`/dashboard/weights/${session.id}`);
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/weights" className="text-xs text-zinc-400 hover:text-zinc-600">
          ← Weigh sessions
        </Link>
        <h1 className="text-lg font-bold text-zinc-900 mt-1">New weigh session</h1>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form action={handleCreate} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Weigh date <span className="text-red-500">*</span>
          </label>
          <input
            name="date"
            type="date"
            required
            defaultValue={todayStr}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Notes</label>
          <input
            name="notes"
            type="text"
            placeholder="Optional — e.g. post-rain, vet visit day"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
        >
          Start session
        </button>
      </form>
    </div>
  );
}
```

### 11. `src/app/dashboard/weights/[id]/page.tsx` (NEW FILE)

Sequential entry flow. This page is a Client Component because it needs local state
to track entered weights before submitting. It makes exactly ONE fetch on mount —
`/api/weigh-sessions/[id]/animals` — which returns the session AND the animal rows.
Do not add additional fetches.

```typescript
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Pen = { id: string; name: string };
type AnimalRow = {
  id: string;
  tagId: string;
  breed: string;
  purchaseWeightKg: number;
  currentPen: Pen | null;
  loggedEntry: { weightKg: number; id: string } | null;
  // Ordered DESC by the API — index 0 is the MOST RECENT log
  weightLogs: { weightKg: number; loggedAt: string }[];
};
type SessionData = {
  session: { id: string; date: string; notes: string | null };
  animals: AnimalRow[];
};

export default function WeighSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [data, setData] = useState<SessionData | null>(null);
  const [entries, setEntries] = useState<Record<string, string>>({}); // animalId → weight string
  const [filter, setFilter] = useState<string>("all"); // penId or "all"
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    params.then(({ id }) => {
      if (cancelled) return;
      setSessionId(id);
      fetch(`/api/weigh-sessions/${id}/animals`)
        .then((r) => {
          if (!r.ok) throw new Error("load failed");
          return r.json();
        })
        .then((d: SessionData) => {
          if (cancelled) return;
          setData(d);
          // Pre-fill already logged entries
          const pre: Record<string, string> = {};
          d.animals.forEach((a) => {
            if (a.loggedEntry) pre[a.id] = String(a.loggedEntry.weightKg);
          });
          setEntries(pre);
        })
        .catch(() => {
          if (!cancelled) setError("Could not load session. Refresh to retry.");
        });
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  if (!data || !sessionId) {
    return (
      <div className="p-4 space-y-2">
        {error ? (
          <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Loading...</p>
        )}
      </div>
    );
  }

  const pens = Array.from(
    new Map(
      data.animals
        .filter((a) => a.currentPen)
        .map((a) => [a.currentPen!.id, a.currentPen!])
    ).values()
  );

  const filtered =
    filter === "all"
      ? data.animals
      : data.animals.filter((a) => a.currentPen?.id === filter);

  const loggedCount = data.animals.filter(
    (a) => a.loggedEntry || (entries[a.id] && entries[a.id] !== "")
  ).length;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const payload = Object.entries(entries)
      .filter(([, v]) => v !== "" && !isNaN(parseFloat(v)))
      .map(([animalId, weightKg]) => ({
        animalId,
        weightKg: parseFloat(weightKg),
        sessionId,
        loggedAt: data!.session.date,
      }));

    if (payload.length === 0) {
      setError("No weights entered.");
      setSaving(false);
      return;
    }

    const res = await fetch("/api/weights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: payload }),
    });

    if (!res.ok) {
      setError("Save failed. Try again.");
    } else {
      router.refresh();
      router.push(`/dashboard/weights`);
    }
    setSaving(false);
  }

  const sessionDate = new Date(data.session.date).toLocaleDateString("en-KE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/weights" className="text-xs text-zinc-400 hover:text-zinc-600">
          ← Weigh sessions
        </Link>
        <h1 className="text-lg font-bold text-zinc-900 mt-1">{sessionDate}</h1>
        <p className="text-sm text-zinc-500">
          {loggedCount} of {data.animals.length} weighed
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Pen filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            filter === "all"
              ? "bg-zinc-900 text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          All pens
        </button>
        {pens.map((p) => (
          <button
            key={p.id}
            onClick={() => setFilter(p.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === p.id
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Animal rows — unweighed first */}
      <div className="space-y-2">
        {[
          ...filtered.filter((a) => !a.loggedEntry),
          ...filtered.filter((a) => a.loggedEntry),
        ].map((animal) => {
          // weightLogs is DESC-ordered: [0] is the most recent prior log.
          // Do NOT read the last index — that is the OLDER of the two returned logs.
          const lastWeight =
            animal.weightLogs.length > 0
              ? animal.weightLogs[0].weightKg
              : animal.purchaseWeightKg;
          const isLogged = !!animal.loggedEntry;

          return (
            <div
              key={animal.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                isLogged
                  ? "border-green-200 bg-green-50"
                  : "border-zinc-200 bg-white"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900">{animal.tagId}</p>
                <p className="text-xs text-zinc-500">
                  {animal.currentPen?.name ?? "—"} · last {lastWeight} kg
                </p>
              </div>
              <input
                type="number"
                step="0.5"
                min="0"
                inputMode="decimal"
                placeholder="kg"
                value={entries[animal.id] ?? ""}
                onChange={(e) =>
                  setEntries((prev) => ({ ...prev, [animal.id]: e.target.value }))
                }
                className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-right focus:border-zinc-500 focus:outline-none"
              />
            </div>
          );
        })}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save weights"}
      </button>
    </div>
  );
}
```

### 12. `src/app/api/weigh-sessions/[id]/animals/route.ts` (NEW FILE)

The single endpoint the session entry page uses — returns session + animal rows
with logged entries and the two most recent prior weight logs per animal:

```typescript
import { NextResponse } from "next/server";
import { getAnimalsForSession } from "@/lib/queries/weights";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getAnimalsForSession(id);
  if (!data) return NextResponse.json({ error: "session not found" }, { status: 404 });
  return NextResponse.json(data);
}
```

### 13. `src/app/dashboard/weights/matrix/page.tsx` (NEW FILE)

Server component wrapper; table is a client component.

```typescript
import { getWeightMatrix } from "@/lib/queries/weights";
import { WeightMatrixClient } from "./WeightMatrixClient";

export default async function MatrixPage() {
  const matrix = await getWeightMatrix();
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-zinc-900">Weighing matrix</h1>
      <WeightMatrixClient matrix={matrix} />
    </div>
  );
}
```

### 14. `src/app/dashboard/weights/matrix/WeightMatrixClient.tsx` (NEW FILE)

```typescript
"use client";

import Link from "next/link";

type Session = { id: string; date: string };
type AdgResult = {
  adgOnFeed: number | null;
  adgSincePurchase: number | null;
  latestWeightKg: number | null;
  logsCount: number;
};
type Row = {
  animal: {
    id: string;
    tagId: string;
    breed: string;
    purchaseWeightKg: number;
    currentPen: { name: string } | null;
  };
  cells: (number | null)[];
  adg: AdgResult;
};
type Matrix = { sessions: Session[]; rows: Row[] };

function fmt(n: number | null, dp = 1) {
  return n === null ? "—" : n.toFixed(dp);
}

export function WeightMatrixClient({ matrix }: { matrix: Matrix }) {
  const { sessions, rows } = matrix;

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No animals or weight data yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr className="bg-zinc-100">
            <th className="text-left px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">Tag</th>
            <th className="text-left px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">Pen</th>
            {sessions.map((s) => (
              <th key={s.id} className="text-right px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">
                {new Date(s.date).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}
              </th>
            ))}
            <th className="text-right px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">ADG on-feed</th>
            <th className="text-right px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">ADG since purchase</th>
            <th className="text-right px-2 py-1.5 font-semibold text-zinc-700 whitespace-nowrap">Gain (kg)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const gain =
              row.adg.latestWeightKg !== null
                ? row.adg.latestWeightKg - row.animal.purchaseWeightKg
                : null;

            return (
              <tr key={row.animal.id} className={i % 2 === 0 ? "bg-white" : "bg-zinc-50"}>
                <td className="px-2 py-1.5 font-medium text-zinc-900 whitespace-nowrap">
                  <Link href={`/dashboard/animals/${row.animal.id}`} className="hover:underline">
                    {row.animal.tagId}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-zinc-500 whitespace-nowrap">
                  {row.animal.currentPen?.name ?? "—"}
                </td>
                {row.cells.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1.5 text-right text-zinc-700 whitespace-nowrap">
                    {cell !== null ? cell.toFixed(1) : "—"}
                  </td>
                ))}
                <td className={`px-2 py-1.5 text-right font-medium whitespace-nowrap ${
                  row.adg.adgOnFeed === null
                    ? "text-zinc-400"
                    : row.adg.adgOnFeed >= 0.8
                    ? "text-green-600"
                    : row.adg.adgOnFeed < 0.6
                    ? "text-red-600"
                    : "text-amber-600"
                }`}>
                  {fmt(row.adg.adgOnFeed, 2)}
                </td>
                <td className="px-2 py-1.5 text-right text-zinc-600 whitespace-nowrap">
                  {fmt(row.adg.adgSincePurchase, 2)}
                </td>
                <td className="px-2 py-1.5 text-right text-zinc-700 whitespace-nowrap">
                  {fmt(gain, 1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

### 15. `src/app/dashboard/animals/[id]/page.tsx` (UPDATE EXISTING)

Extend the existing animal detail page. Read the current file first.

Add weight history section after the existing registration data. Requirements:
- Fetch animal's weight logs via `getAnimal` (add the weightLogs include below)
- Show a table: date · weight kg · interval ADG (kg/day since previous log)
- Show ADG on-feed and ADG since purchase as summary figures
- Add the `WeightChartClient` client component for the Recharts line chart

Add to the existing `getAnimal` query in `src/lib/queries/animals.ts`:
```typescript
// In getAnimal, add weightLogs to include:
weightLogs: {
  orderBy: { loggedAt: "asc" },
  include: { session: { select: { id: true, date: true } } },
},
```

In `src/app/dashboard/animals/[id]/page.tsx`, after the existing registration detail block, add:
```typescript
import { computeAdg } from "@/lib/queries/weights";
import { WeightChartClient } from "./WeightChartClient";

// In the page component, after fetching animal:
const adg = computeAdg(
  animal.weightLogs,
  animal.purchaseWeightKg,
  animal.purchaseDate
);

// ADG summary block (server-rendered):
<div className="grid grid-cols-2 gap-3">
  <div className="rounded-lg border border-zinc-200 bg-white p-3">
    <p className="text-xs text-zinc-500">ADG on-feed</p>
    <p className="text-xl font-bold text-zinc-900">
      {adg.adgOnFeed !== null ? `${adg.adgOnFeed.toFixed(2)} kg/day` : "—"}
    </p>
    <p className="text-xs text-zinc-400 mt-0.5">needs ≥ 2 weigh sessions</p>
  </div>
  <div className="rounded-lg border border-zinc-200 bg-white p-3">
    <p className="text-xs text-zinc-500">ADG since purchase</p>
    <p className="text-xl font-bold text-zinc-900">
      {adg.adgSincePurchase !== null ? `${adg.adgSincePurchase.toFixed(2)} kg/day` : "—"}
    </p>
    <p className="text-xs text-zinc-400 mt-0.5">
      purchase: {animal.purchaseWeightKg} kg
    </p>
  </div>
</div>

// Weight chart (client component — see sections 16/16b for the required pattern):
{animal.weightLogs.length > 0 && (
  <WeightChartClient
    data={animal.weightLogs.map((l) => ({
      date: l.loggedAt.toISOString().slice(0, 10),
      weightKg: l.weightKg,
    }))}
  />
)}

// Weight log table (server-rendered):
<div className="space-y-2">
  <h2 className="text-sm font-semibold text-zinc-700">Weight history</h2>
  {animal.weightLogs.length === 0 ? (
    <p className="text-sm text-zinc-400">No weights logged yet.</p>
  ) : (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-zinc-100">
          <th className="text-left py-1.5 font-medium text-zinc-500">Date</th>
          <th className="text-right py-1.5 font-medium text-zinc-500">Weight (kg)</th>
          <th className="text-right py-1.5 font-medium text-zinc-500">Interval ADG</th>
        </tr>
      </thead>
      <tbody>
        {animal.weightLogs.map((log, i) => {
          const prev = animal.weightLogs[i - 1];
          const intervalAdg =
            prev
              ? (log.weightKg - prev.weightKg) /
                ((new Date(log.loggedAt).getTime() - new Date(prev.loggedAt).getTime()) /
                  86_400_000)
              : null;
          return (
            <tr key={log.id} className="border-b border-zinc-50">
              <td className="py-1.5 text-zinc-700">
                {new Date(log.loggedAt).toLocaleDateString("en-KE", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </td>
              <td className="py-1.5 text-right font-medium text-zinc-900">
                {log.weightKg.toFixed(1)}
              </td>
              <td className="py-1.5 text-right text-zinc-500">
                {intervalAdg !== null ? `${intervalAdg.toFixed(2)} kg/d` : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  )}
</div>
```

### 16. `src/app/dashboard/animals/[id]/WeightChart.tsx` (NEW FILE)

**CRITICAL — Recharts quarantine pattern. Read before writing either chart file.**

Recharts chart containers (`LineChart`) inspect the TYPES of their children to
register axes, lines, and tooltips. Wrapping individual Recharts components
(`XAxis`, `Line`, etc.) in `next/dynamic` breaks this — the dynamic wrapper's type
is not `XAxis`, so the chart silently renders empty. The ONLY correct quarantine
is: (a) an inner client component that imports recharts NORMALLY and renders the
whole chart, and (b) an outer client component that dynamically imports the inner
one with `ssr: false`. Do not "optimize" this into per-component dynamic imports.

```typescript
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Props = { data: { date: string; weightKg: number }[] };

export default function WeightChart({ data }: Props) {
  if (data.length < 2) return null; // no chart until 2+ points

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <p className="text-xs font-medium text-zinc-500 mb-2">Weight over time</p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            tickFormatter={(v: string) => v.slice(5)} // MM-DD
          />
          <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(1)} kg`, "Weight"]}
            labelFormatter={(l: string) => l}
          />
          <Line
            type="monotone"
            dataKey="weightKg"
            stroke="#18181b"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### 16b. `src/app/dashboard/animals/[id]/WeightChartClient.tsx` (NEW FILE)

The dynamic wrapper. This is the component the (server) detail page imports.
`ssr: false` is legal here because this file is a Client Component.

```typescript
"use client";

import dynamic from "next/dynamic";

const WeightChart = dynamic(() => import("./WeightChart"), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <p className="text-xs text-zinc-400">Loading chart…</p>
    </div>
  ),
});

type Props = { data: { date: string; weightKg: number }[] };

export function WeightChartClient({ data }: Props) {
  return <WeightChart data={data} />;
}
```

### 17. `src/components/Nav.tsx` (UPDATE EXISTING)

Add "Weights" link to the nav. Read the current Nav.tsx first to match the exact
pattern. Add `{ href: "/dashboard/weights", label: "Weights" }` to the existing
`links` array, after Animals. Do not restructure the component.

---

## What NOT to change

- `src/lib/db.ts` — do not touch
- `src/proxy.ts` — do not touch
- `src/auth.ts` — do not touch
- `src/app/dashboard/pens/**` — do not touch
- `src/app/dashboard/animals/new/page.tsx` — do not touch
- `src/app/dashboard/animals/page.tsx` — do not touch
- `src/lib/queries/pens.ts` — do not touch
- `prisma/schema.prisma` generator block — do not modify
- `package.json` / `package-lock.json` — do not add new npm packages
- Do NOT run `prisma migrate dev` or create a `prisma/migrations/` directory —
  this repo uses `prisma db push` (see gotchas)
- The try/catch in section 10's server action — do not "simplify" or restructure;
  the NEXT_REDIRECT re-throw pattern is intentional
- The two-file Recharts pattern in sections 16/16b — do not merge into one file
  or convert to per-component dynamic imports
- The DESC ordering of `weightLogs` in `getAnimalsForSession` and the matching
  `weightLogs[0]` read in section 11 — these are a coupled pair

---

## Acceptance Criteria

```bash
# 1. TypeScript clean (from the confirmed repo root)
npx tsc --noEmit

# 2. Build clean
npm run build

# 3. Schema applied — WeighSession and WeightLog tables exist on Neon
DATABASE_URL="$(grep '^DIRECT_URL=' .env.local | cut -d= -f2- | tr -d '"')" npx prisma db push
```

Manual flow to verify:
1. Navigate to `/dashboard/weights` — empty list, "New session" button visible
2. Create a session for today — redirects to session entry page
3. Session entry page loads with ONE network request to
   `/api/weigh-sessions/[id]/animals` (verify in devtools — no calls to
   `/api/weights/matrix` on this page)
4. Enter weights for 3 animals in Pen 1 — submit → redirects to session list
5. Session shows "3/N weighed" with correct counts
6. **Upsert test (A5 partial sessions):** re-open the same session — the 3 logged
   animals show green with their weights pre-filled. Change one animal's weight,
   save. Verify: the value updated on the animal's detail page, the session still
   shows "3/N" (count did NOT increase), and no duplicate WeightLog row exists.
7. For an animal with a prior log, the "last X kg" hint on the entry row shows the
   MOST RECENT prior weight, not an older one
8. Navigate to `/dashboard/weights/matrix` — animals in rows, sessions in columns,
   correct weights shown
9. Navigate to `/dashboard/animals/[id]` for a weighed animal — weight history
   table shows, ADG since purchase computed
10. After second session with same animals: ADG on-feed appears (not "—")
11. Recharts chart renders on animal detail page with visible axes and line
    (not an empty container)
12. Create a second session with the same date — "A session already exists for
    this date" error shown (P2002 path)
13. `/api/export/weights` returns valid CSV with quoted fields

---

## Notes

- `recharts` is already in package.json from M1 scaffold — do not reinstall
- The Recharts quarantine is the two-file pattern in sections 16/16b: inner component
  with normal recharts imports, outer client component doing a whole-component
  `next/dynamic` import with `ssr: false`. Per-component dynamic imports of Recharts
  primitives BREAK chart rendering (child-type inspection) and must not be used.
- `loggedAt` is always stored UTC midnight. When displaying dates, use
  `toLocaleDateString` with `"en-KE"` locale consistently.
- The session entry page (`/dashboard/weights/[id]/page.tsx`) is a Client Component
  because it needs local state to collect all weight inputs before saving. This and
  the two chart files are the only `"use client"` additions in M2.
- The session-list denominator (`totalActive`) is today's active headcount applied to
  all sessions including historical ones — a known, accepted MVP approximation
  (commented in `listWeighSessions`).
- After `prisma db push`, run `prisma generate` to regenerate the client if tsc
  shows missing types. The postinstall script handles this on Vercel automatically.