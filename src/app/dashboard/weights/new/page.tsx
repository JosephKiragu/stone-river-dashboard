import Link from "next/link";
import { createWeighSession } from "@/lib/queries/weights";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";

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
