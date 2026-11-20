'use client';

import { LogOut, Menu, Settings, UserRound, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useId, useRef, useState } from "react";
import AdminNav from "@/components/adminComponents/adminNav";
import { type User, useSession } from "@/lib/session";
import { logout } from "@/services/auth";

const action = "inline-flex min-h-11 shrink-0 items-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";
const iconAction = `${action} size-11 justify-center p-0`;
const accountAction = `${action} w-full gap-3 px-3 py-0 text-sm font-semibold`;
const activeAction = "bg-slate-100 text-foreground";
const settingsHref = "/admin/configuracoes";
const profileHref = "/admin/configuracoes/perfil";

export default function Header() {
  return (
    <header className="relative flex min-h-20 w-full flex-wrap items-center gap-x-1 gap-y-2 bg-white px-3 py-3 sm:gap-x-5 sm:px-6">
      <Link href="/" className="w-24 shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground sm:w-28">
        <Image src="/psiu-logo-azul.png" width={1142} height={380} alt="Psiu — início" />
      </Link>
      <Suspense>
        <HeaderControls />
      </Suspense>
    </header>
  );
}

function HeaderControls() {
  const pathname = usePathname();
  const session = useSession();
  if (!session) {
    return (
      <Link href="/login" aria-label="Entrar" title="Entrar" className={`${iconAction} ml-auto`}>
        <UserRound size={21} aria-hidden="true" />
      </Link>
    );
  }

  return <HeaderMenu key={pathname} user={session.user} pathname={pathname} />;
}

function HeaderMenu({ user, pathname }: { user: User; pathname: string }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const menuId = useId();
  const accountId = useId();
  const mobileToggle = useRef<HTMLButtonElement>(null);
  const accountToggle = useRef<HTMLButtonElement>(null);
  const showPanelNav = pathname === "/admin" || pathname.startsWith("/admin/");
  const closeMenus = () => {
    setMobileOpen(false);
    setAccountOpen(false);
  };
  const isProfile = pathname === profileHref;
  const isSettings = !isProfile && (
    pathname === settingsHref || pathname.startsWith(`${settingsHref}/`) ||
    pathname === "/admin/senha" || pathname === "/admin/cozinha/configuracoes" ||
    pathname === "/admin/cozinha/impressao"
  );

  return (
    <div className="ml-auto md:ml-0 md:flex-1"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || (!mobileOpen && !accountOpen)) return;
        const toggle = accountToggle.current?.offsetWidth ? accountToggle : mobileToggle;
        closeMenus();
        toggle.current?.focus();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeMenus();
      }}>
      <button ref={mobileToggle} type="button" aria-label={mobileOpen ? "Fechar menu do painel" : "Abrir menu do painel"}
        aria-expanded={mobileOpen} aria-controls={menuId} onClick={() => setMobileOpen(!mobileOpen)}
        className={`${iconAction} hover:scale-100 hover:shadow-none active:scale-100 aria-expanded:bg-slate-100 md:hidden`}>
        {mobileOpen ? <X size={23} aria-hidden="true" /> : <Menu size={23} aria-hidden="true" />}
      </button>
      <div id={menuId}
        className={`${mobileOpen ? "flex" : "hidden"} max-md:absolute max-md:inset-x-3 max-md:top-full max-md:z-30 max-md:max-h-[calc(100dvh-5rem)] max-md:flex-col max-md:gap-2 max-md:overflow-y-auto max-md:rounded-xl max-md:bg-white max-md:p-2 max-md:shadow-lg md:flex md:items-center md:gap-5`}>
        {showPanelNav && <AdminNav user={user} pathname={pathname} onNavigate={closeMenus} />}
        <div className="md:relative md:ml-auto md:shrink-0"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setAccountOpen(false);
          }}>
          <button ref={accountToggle} type="button" aria-label="Menu da conta" title="Menu da conta"
            aria-expanded={accountOpen} aria-controls={accountId} onClick={() => setAccountOpen(!accountOpen)}
            className={`${iconAction} hover:scale-100 hover:shadow-none active:scale-100 aria-expanded:bg-slate-100 max-md:hidden`}>
            <UserRound size={21} aria-hidden="true" />
          </button>
          <div id={accountId}
            className={`flex flex-col gap-1 md:absolute md:right-0 md:top-full md:z-30 md:mt-2 md:w-52 md:rounded-xl md:bg-white md:p-2 md:shadow-lg ${accountOpen ? "" : "md:hidden"}`}>
            <Link href={profileHref} prefetch={false} aria-current={isProfile ? "page" : undefined} onNavigate={closeMenus}
              className={`${accountAction} ${isProfile ? activeAction : ""}`}>
              <UserRound size={21} aria-hidden="true" />
              Meu perfil
            </Link>
            <Link href={settingsHref} prefetch={false} aria-current={pathname === settingsHref ? "page" : undefined} onNavigate={closeMenus}
              className={`${accountAction} ${isSettings ? activeAction : ""}`}>
              <Settings size={21} aria-hidden="true" />
              Configurações
            </Link>
            <button type="button" aria-label="Sair"
              onClick={() => { void logout(); router.replace("/login"); }}
              className={`${accountAction} hover:scale-100 hover:bg-red-50 hover:text-red-700 hover:shadow-none active:scale-100`}>
              <LogOut size={21} aria-hidden="true" />
              Sair
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
