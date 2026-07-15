# Patch 1 — Animal Register Cleanup (rev 2)

Three changes to the Animal model and forms. The Animal table is currently empty,
but Pens, WeighSessions, and WeightLogs contain live data — schema changes MUST
use `db push` (see gotchas), never `prisma migrate`.

---

## MANDATORY: Read these files first

```bash
cat prisma/schema.prisma
cat src/lib/queries/animals.ts
cat src/app/dashboard/animals/new/page.tsx
cat src/app/dashboard/animals/[id]/page.tsx
cat src/app/api/animals/route.ts
cat src/app/api/export/animals/route.ts
cat src/app/globals.css
```

**Confirm the Prisma client generator `output` path in schema.prisma** — use the
repo's established path for any Prisma type imports. Do not modify the generator block.

## Critical gotchas (do not re-investigate)

- This repo does NOT use Prisma Migrate. No `prisma/migrations/` directory, no
  `_prisma_migrations` table. Do NOT run `prisma migrate dev` — drift detection
  will offer a database reset, destroying live M1/M2 data (pens, weigh sessions,
  weight logs). Do NOT create a migrations directory.
- `.env.local` contains a bcrypt hash with escaped `$` characters — NEVER `source`
  it. Extract vars with grep (see schema-push command below).
- `src/app/dashboard/animals/new/page.tsx` contains a try/catch whose final
  `throw err` re-throws NEXT_REDIRECT by design. You will edit this file for
  Change 2/3 — do NOT restructure or "simplify" that try/catch.

---

## Change 1 — Fix input text contrast (global)

**Problem:** Form input fields have no explicit text colour class. Typed text
renders as light grey against white backgrounds.

**Fix:** Add a base-layer rule to `src/app/globals.css`. This repo is Tailwind
CSS v4 — use the CSS variable form, NOT the v3 `theme('colors.zinc.900')`
function (deprecated dot-notation in v4):

```css
@layer base {
  input,
  select,
  textarea {
    color: var(--color-zinc-900);
  }
}
```

Add this block after the existing `body { ... }` rule. No other file changes
needed for this item.

---

## Change 2 — Replace `dateOfBirth` with `ageAtPurchaseMonths`

Jeremy records age at purchase in months, not an exact birth date. Replace the
field end-to-end.

### 2a. Prisma schema (`prisma/schema.prisma`)

Remove:
```
dateOfBirth      DateTime?
```

Add (in same position):
```
ageAtPurchaseMonths Int?
```

### 2b. Apply schema (single push for Changes 2 AND 3)

Make BOTH schema edits (2a and 3a) first, then apply once:

```bash
DATABASE_URL="$(grep '^DIRECT_URL=' .env.local | cut -d= -f2- | tr -d '"')" npx prisma db push --accept-data-loss
npx prisma generate
```

`--accept-data-loss` is required because dropping the `dateOfBirth` column
triggers an interactive confirmation that would hang a non-interactive run. It
is safe HERE ONLY because the Animal table is verifiably empty. This flag is a
one-off for this patch — do not carry it into future specs by default.

### 2c. `src/lib/queries/animals.ts` — `createAnimal`

Change the function signature:
```ts
// REMOVE
dateOfBirth?: Date;
// ADD
ageAtPurchaseMonths?: number;
```

Update the `data` object passed to `tx.animal.create` accordingly.

### 2d. `src/app/dashboard/animals/new/page.tsx`

In `handleRegister` (inside the existing try block — do not restructure the
try/catch):
- Remove: `const dobRaw = formData.get("dateOfBirth") as string;`
- Add:
  ```ts
  const ageRaw = formData.get("ageAtPurchaseMonths") as string;
  const ageAtPurchaseMonths = ageRaw ? parseInt(ageRaw, 10) : undefined;
  ```
- Remove `dateOfBirth` from the `createAnimal(...)` call
- Add `ageAtPurchaseMonths` to the `createAnimal(...)` call

In the form JSX, replace the "Date of birth" field:
```tsx
// REMOVE the entire Date of birth <div> block

// ADD in its place:
<div>
  <label className="block text-sm font-medium text-zinc-700 mb-1">
    Age at purchase (months)
  </label>
  <input
    name="ageAtPurchaseMonths"
    type="number"
    step="1"
    min="1"
    max="120"
    placeholder="e.g. 18"
    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-500 focus:outline-none"
  />
</div>
```

Field is optional — no `required` attribute.

### 2e. `src/app/dashboard/animals/[id]/page.tsx`

**TypeScript strict note:** narrowing of `animal.ageAtPurchaseMonths` does NOT
propagate into a closure/IIFE — reading the property inside an arrow function
after a `!= null` check still types as `number | null` and fails `tsc`. Hoist
to a local const BEFORE the `rows` array:

```ts
// Above the rows array:
const age = animal.ageAtPurchaseMonths;
let ageDisplay = "—";
if (age != null) {
  const yrs = Math.floor(age / 12);
  const mo = age % 12;
  if (yrs === 0) ageDisplay = `${mo} mo`;
  else if (mo === 0) ageDisplay = `${yrs} yr`;
  else ageDisplay = `${yrs} yr ${mo} mo`;
}
```

Then in the `rows` array, replace the "Date of birth" entry:
```ts
// REMOVE
{
  label: "Date of birth",
  value: animal.dateOfBirth ? formatDate(animal.dateOfBirth) : "—",
},
// ADD
{
  label: "Age at purchase",
  value: ageDisplay,
},
```

Do NOT remove the `formatDate` helper — it is still used for `purchaseDate` and
the pen-history dates.

### 2f. `src/app/api/animals/route.ts`

In `POST`:
- Remove `dateOfBirth` from destructuring and from `tx.animal.create` data
- Add `ageAtPurchaseMonths` to destructuring
- Pass to `tx.animal.create`:
  ```ts
  ageAtPurchaseMonths:
    ageAtPurchaseMonths != null
      ? Number.parseInt(String(ageAtPurchaseMonths), 10)
      : undefined,
  ```
  (`String()` coercion because the JSON value may arrive as number or string.)

Do NOT restructure the existing try/catch or the P2002 check in this route.

### 2g. `src/app/api/export/animals/route.ts`

In the `headers` array, replace `"dateOfBirth"` with `"ageAtPurchaseMonths"`.

In the `rows` map, replace:
```ts
a.dateOfBirth ? a.dateOfBirth.toISOString().split("T")[0] : "",
```
With:
```ts
a.ageAtPurchaseMonths ?? "",
```
(The export route already quote-escapes and stringifies every field.)

---

## Change 3 — Add `purchaseMarket` field

Track which market or farm the animal was purchased from (e.g. Narok, Bisil,
Kajiado).

### 3a. Prisma schema (`prisma/schema.prisma`)

Add after `purchasePriceKes`:
```
purchaseMarket   String?
```

Applied in the same single `db push` as Change 2 (see 2b).

### 3b. `src/lib/queries/animals.ts` — `createAnimal`

Add to signature:
```ts
purchaseMarket?: string;
```

Pass through to the `tx.animal.create` data object.

### 3c. `src/app/dashboard/animals/new/page.tsx`

In `handleRegister`, add:
```ts
const purchaseMarket = (formData.get("purchaseMarket") as string)?.trim() || undefined;
```

Add `purchaseMarket` to the `createAnimal(...)` call.

In the form JSX, add a new field after the "Purchase date" field and before the
purchase weight/price grid:
```tsx
<div>
  <label className="block text-sm font-medium text-zinc-700 mb-1">
    Purchase market
  </label>
  <input
    name="purchaseMarket"
    type="text"
    placeholder="e.g. Narok, Bisil, Kajiado"
    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-500 focus:outline-none"
  />
</div>
```

Field is optional — no `required` attribute.

### 3d. `src/app/dashboard/animals/[id]/page.tsx`

In the `rows` array, add after the "Purchase price" row:
```ts
{
  label: "Purchase market",
  value: animal.purchaseMarket ?? "—",
},
```

### 3e. `src/app/api/animals/route.ts`

In `POST`:
- Add `purchaseMarket` to destructuring
- Pass `purchaseMarket: purchaseMarket ?? undefined` to `tx.animal.create`

### 3f. `src/app/api/export/animals/route.ts`

Add `"purchaseMarket"` to `headers` after `"purchasePriceKes"`.

Add `a.purchaseMarket ?? ""` to the `rows` map in the corresponding position.

---

## What NOT to change

- `src/lib/db.ts`, `src/proxy.ts`, `src/auth.ts` — do not touch
- `src/lib/queries/weights.ts` and everything under `src/app/dashboard/weights/**`
  and `src/app/api/weigh-sessions/**`, `src/app/api/weights/**` — do not touch
- `prisma/schema.prisma`: only the two Animal-model field changes above; do not
  modify Pen, PenAssignment, WeighSession, WeightLog, AppSettings, or the
  generator block
- The try/catch + NEXT_REDIRECT pattern in `animals/new/page.tsx` and the P2002
  handling in `api/animals/route.ts` — edit around them, do not restructure
- `package.json` / `package-lock.json` — no new packages
- Do NOT run `prisma migrate dev` or create a `prisma/migrations/` directory

---

## Verification checklist

1. `npx tsc --noEmit` — clean, zero errors (in particular no null-narrowing
   error in `animals/[id]/page.tsx`)
2. `npm run build` — clean
3. Register a new animal with age 18 months, market "Narok" — confirm the detail
   page shows "1 yr 6 mo" and "Narok"
4. Register a second animal with no age and no market — confirm both fields show
   "—" on the detail page
5. Open `/api/export/animals` CSV — confirm headers include `ageAtPurchaseMonths`
   and `purchaseMarket` (not `dateOfBirth`)
6. Type in any form input — text is dark (zinc-900), not light grey
7. Duplicate tagId — confirm the P2002 error message still shows
8. Open `/dashboard/weights` and one weigh session — pages load normally
   (regenerated Prisma client did not break the weights module)
9. Confirm no `prisma/migrations/` directory was created (`ls prisma/`)