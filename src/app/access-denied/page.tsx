"use client";

import Link from "next/link";

import { usePermissions } from "@/hooks/usePermissions";
import { resolveHomePath } from "@/lib/permissions/home";

export default function AccessDeniedPage() {
  const { permissions, loading } = usePermissions();
  const homePath = loading ? "/dashboard" : resolveHomePath(permissions);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <section className="w-full max-w-md rounded-xl border border-line bg-surface p-6 text-center shadow-sm sm:p-8">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          Restricted access
        </p>
        <h1 className="mt-3 font-display text-2xl font-bold text-navy-900">
          You can&apos;t open this page
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-500">
          Your account does not have access to this area.
        </p>
        <Link href={homePath} className="btn btn-primary mt-6">
          Go to my home
        </Link>
      </section>
    </main>
  );
}
