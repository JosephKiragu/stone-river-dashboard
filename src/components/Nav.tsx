"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const links = [
  { href: "/dashboard/pens", label: "Pens" },
  { href: "/dashboard/animals", label: "Animals" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="bg-white border-b border-zinc-200 px-4 py-3">
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-base font-bold text-zinc-900">DROVER</span>
          </div>
          <nav className="flex gap-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors ${
                  pathname.startsWith(link.href)
                    ? "text-zinc-900"
                    : "text-zinc-400 hover:text-zinc-700"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
