import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">DROVER</h1>
          <p className="text-xs text-zinc-500">Feedlot Management</p>
        </div>
        <SignOutButton />
      </header>

      <main className="px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="rounded-2xl border border-zinc-200 bg-white p-8">
            <div className="text-4xl mb-4">🐄</div>
            <h2 className="text-xl font-semibold text-zinc-900 mb-2">
              M0 complete
            </h2>
            <p className="text-sm text-zinc-500">
              You&apos;re logged in. Database and modules coming next.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
