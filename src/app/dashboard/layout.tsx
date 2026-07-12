import { Nav } from "@/components/Nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="px-4 py-6 max-w-2xl mx-auto">{children}</main>
    </div>
  );
}
