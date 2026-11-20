'use client';

import Link from "next/link";
import PrintJobsPanel from "@/components/cozinhaComponents/printJobsPanel";
import RequireAuth from "@/components/requireAuth";
import { canAccessKitchen } from "@/lib/kitchenQueue";

export default function FilaDeImpressao() {
  return (
    <RequireAuth roles={["OWNER", "STAFF"]} canAccess={canAccessKitchen}>
      <main className="mx-auto w-full max-w-4xl space-y-4 px-5 py-8">
        <Link href="/admin/configuracoes" className="text-sm text-slate-600 underline">Voltar às configurações</Link>
        <PrintJobsPanel enabled />
      </main>
    </RequireAuth>
  );
}
