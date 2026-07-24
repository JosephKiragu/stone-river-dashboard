import Link from "next/link";
import { listWeighSessions } from "@/lib/queries/weights";

export const dynamic = "force-dynamic";

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

      <div className="pt-2 flex gap-4">
        <Link
          href="/dashboard/weights/matrix"
          className="text-sm text-zinc-500 hover:text-zinc-700 underline underline-offset-2"
        >
          View weighing matrix →
        </Link>
        <Link
          href="/dashboard/weights/stats"
          className="text-sm text-zinc-500 hover:text-zinc-700 underline underline-offset-2"
        >
          View stats →
        </Link>
      </div>
    </div>
  );
}
