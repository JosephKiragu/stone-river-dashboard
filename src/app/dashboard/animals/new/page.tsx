import Link from "next/link";
import { listPens } from "@/lib/queries/pens";
import { createAnimal } from "@/lib/queries/animals";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";

export default async function NewAnimalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const pens = await listPens();

  async function handleRegister(formData: FormData) {
    "use server";
    try {
      const tagId = (formData.get("tagId") as string)?.trim();
      const breed = (formData.get("breed") as string)?.trim();
      const ageRaw = formData.get("ageAtPurchaseMonths") as string;
      const ageAtPurchaseMonths = ageRaw ? parseInt(ageRaw, 10) : undefined;
      const purchaseDateRaw = formData.get("purchaseDate") as string;
      const purchaseWeightKg = parseFloat(formData.get("purchaseWeightKg") as string);
      const purchasePriceKes = parseFloat(formData.get("purchasePriceKes") as string);
      const purchaseMarket = (formData.get("purchaseMarket") as string)?.trim() || undefined;
      const penId = formData.get("penId") as string;

      if (!tagId || !breed || !purchaseDateRaw || isNaN(purchaseWeightKg) || isNaN(purchasePriceKes) || !penId) {
        redirect("/dashboard/animals/new?error=All%20required%20fields%20must%20be%20filled");
      }

      await createAnimal({
        tagId,
        breed,
        ageAtPurchaseMonths,
        purchaseDate: new Date(purchaseDateRaw),
        purchaseWeightKg,
        purchasePriceKes,
        purchaseMarket,
        penId,
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        redirect("/dashboard/animals/new?error=Tag%20ID%20already%20exists");
      }
      // Re-throw everything else, including NEXT_REDIRECT signals
      throw err;
    }
    redirect("/dashboard/animals");
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/animals"
          className="text-xs text-zinc-400 hover:text-zinc-600"
        >
          ← Animals
        </Link>
        <h1 className="text-lg font-bold text-zinc-900 mt-1">Register animal</h1>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form action={handleRegister} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Tag ID <span className="text-red-500">*</span>
          </label>
          <input
            name="tagId"
            type="text"
            required
            placeholder="e.g. KE-0042"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Breed <span className="text-red-500">*</span>
          </label>
          <input
            name="breed"
            type="text"
            required
            placeholder="e.g. Boran, Sahiwal, Boran x Sahiwal"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>

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

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Purchase date <span className="text-red-500">*</span>
          </label>
          <input
            name="purchaseDate"
            type="date"
            required
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>

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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Purchase weight (kg) <span className="text-red-500">*</span>
            </label>
            <input
              name="purchaseWeightKg"
              type="number"
              step="0.1"
              min="0"
              required
              placeholder="e.g. 280"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Purchase price (KES) <span className="text-red-500">*</span>
            </label>
            <input
              name="purchasePriceKes"
              type="number"
              step="1"
              min="0"
              required
              placeholder="e.g. 56000"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Pen <span className="text-red-500">*</span>
          </label>
          <select
            name="penId"
            required
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-500 focus:outline-none"
          >
            <option value="">Select a pen</option>
            {pens.map((pen) => (
              <option key={pen.id} value={pen.id}>
                {pen.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
        >
          Register animal
        </button>
      </form>
    </div>
  );
}
