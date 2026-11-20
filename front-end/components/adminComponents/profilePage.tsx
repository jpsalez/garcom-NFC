'use client';

import Link from "next/link";
import { useSession } from "@/lib/session";

export default function ProfilePage() {
  const session = useSession();
  if (!session) return null;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <Link href="/admin/configuracoes" className="text-sm text-slate-600 underline">Voltar às configurações</Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Meu perfil</h1>
      <dl className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-5">
        <div className="py-4">
          <dt className="text-sm text-slate-600">Nome</dt>
          <dd className="break-words font-medium">{session.user.name}</dd>
        </div>
        <div className="py-4">
          <dt className="text-sm text-slate-600">E-mail</dt>
          <dd className="break-words font-medium">{session.user.email}</dd>
        </div>
      </dl>
    </main>
  );
}
