import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
      <section className="w-full rounded-lg border p-6 shadow-sm">
        <h1 className="mb-2 text-2xl font-semibold">Feedlot Login</h1>
        <p className="mb-6 text-sm text-gray-600">
          Sign in to access your dashboard.
        </p>
        <LoginForm />
      </section>
    </main>
  )
}
