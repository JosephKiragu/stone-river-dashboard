export default function LoginPage(): JSX.Element {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-12">
      <section className="mx-auto max-w-md rounded-lg bg-white p-8 shadow">
        <h1 className="text-2xl font-semibold text-slate-900">Login</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to access the Feedlot Dashboard.</p>
        <form className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700" htmlFor="email">
            Email
          </label>
          <input className="w-full rounded border border-slate-300 px-3 py-2" id="email" type="email" />
          <label className="block text-sm font-medium text-slate-700" htmlFor="password">
            Password
          </label>
          <input className="w-full rounded border border-slate-300 px-3 py-2" id="password" type="password" />
          <button className="w-full rounded bg-slate-900 px-4 py-2 text-white" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  )
}
