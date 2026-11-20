'use client';

import { ArrowRight, KeyRound, List, Printer, UserRound } from "lucide-react";
import Link from "next/link";
import { canAccessKitchen, canConfigurePrinting } from "@/lib/kitchenQueue";
import { useSession } from "@/lib/session";

export default function SettingsPage() {
  const session = useSession();
  if (!session) return null;

  const items = [
    { href: "/admin/configuracoes/perfil", title: "Meu perfil", detail: "Dados da sua conta", icon: UserRound },
    { href: "/admin/senha", title: "Senha", detail: "Troque a senha da sua conta", icon: KeyRound },
  ];
  if (canConfigurePrinting(session.user)) {
    items.push({ href: "/admin/cozinha/configuracoes", title: "Impressão da cozinha", detail: "Consulte o status e gerencie a fila de impressão", icon: Printer });
  }

  if (canAccessKitchen(session.user)) {
    items.push({ href: "/admin/cozinha/impressao", title: "Fila de impressão", detail: "Acompanhe comandas e solicite segunda via", icon: List });
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
      <ul className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
        {items.map(({ href, title, detail, icon: Icon }) => (
          <li key={href}>
            <Link href={href} prefetch={false} className="flex items-center gap-4 rounded-xl p-4 hover:bg-slate-50 sm:p-5">
              <span className="rounded-lg bg-slate-100 p-2.5"><Icon size={20} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-slate-600">{detail}</span>
              </span>
              <ArrowRight size={18} className="shrink-0 text-slate-500" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
