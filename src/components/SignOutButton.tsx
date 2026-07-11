"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
    >
      Sign out
    </button>
  );
}
