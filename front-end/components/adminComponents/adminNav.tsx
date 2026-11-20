import Link from "next/link";
import type { User } from "@/lib/session";
import { canAccessKitchen } from "@/lib/kitchenQueue";

export default function AdminNav({ user, pathname, onNavigate }: {
  user: User;
  pathname: string;
  onNavigate: () => void;
}) {
  const items = user.role === "SUPER_ADMIN"
    ? [{ href: "/admin/restaurantes", label: "Restaurantes" }]
    : [{ href: "/admin/waiter", label: "Chamados" }];

  if (user.role === "OWNER") {
    items.push({ href: "/admin/mesas", label: "Mesas" }, { href: "/admin/equipe", label: "Equipe" });
  }
  if (user.role === "OWNER" || (user.role === "STAFF" && user.category === "MANAGER")) {
    items.push({ href: "/admin/cardapio", label: "Cardápio" });
  }
  if (canAccessKitchen(user)) items.push({ href: "/admin/cozinha", label: "Cozinha" });

  return (
    <nav aria-label="Painel" className="flex flex-col gap-1 md:flex-row md:flex-wrap">
      {items.map(({ href, label }) => (
        <Link key={href} href={href} prefetch={false} aria-current={pathname === href ? "page" : undefined}
          onNavigate={onNavigate}
          className="inline-flex min-h-11 items-center whitespace-nowrap rounded-xl px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground aria-[current=page]:bg-slate-100 aria-[current=page]:text-foreground">
          {label}
        </Link>
      ))}
    </nav>
  );
}
