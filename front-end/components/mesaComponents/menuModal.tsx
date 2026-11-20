'use client'

import { useEffect, useRef, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { API_URL, ApiError } from "@/lib/api";
import type { PublicMenu } from "@/lib/menuTypes";
import OrderPanel from "./orderPanel";
import { getTableMenu } from "@/services/menu";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function MenuModal({ code, token, onClose }: { code: string; token: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    let active = true;
    getTableMenu(code).then((result) => { if (active) setMenu(result); }).catch((err: unknown) => {
      if (!active) return;
      if (err instanceof ApiError && err.code === "MENU_NOT_PUBLISHED") {
        setError("Este restaurante ainda não publicou um cardápio.");
        return;
      }
      setError("Não foi possível carregar o cardápio. Verifique sua conexão e tente novamente.");
    });
    return () => { active = false; };
  }, [code, attempt]);

  const appearance = menu?.content.presentation;
  const palette = appearance?.palette ?? { primary: "#4e7332", background: "#f8f8f5", surface: "#ffffff", text: "#1d2540" };
  const radius = ({ none: "0", small: "4px", medium: "12px", large: "24px" } as const)[appearance?.border_radius ?? "medium"];

  return (
    <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="menu-title"
      className="fixed inset-0 m-auto h-[100dvh] max-h-none w-full max-w-none overflow-hidden border-0 bg-[#f8f8f5] p-0 text-[#1d2540] backdrop:bg-black/60 ">
      <div className="flex h-full flex-col">
        <header className="shrink-0 border-b border-[#e9ebe5] bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#728167]">À mesa</p><h2 id="menu-title" className="text-lg font-bold">Cardápio</h2></div>
          <button type="button" onClick={onClose} aria-label="Fechar cardápio" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f1f3ee] text-[#1d2540] transition hover:bg-[#e3e8dc]"><X size={21} /></button>
        </div></header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ backgroundColor: palette.background, color: palette.text, fontFamily: appearance?.typography === "serif" ? "serif" : appearance?.typography === "mono" ? "monospace" : "sans-serif" }}>
          {!menu && !error && <p role="status" className="px-6 py-16 text-center text-sm text-slate-500">Carregando cardápio...</p>}
          {error && <div className="flex flex-col items-center gap-4 px-6 py-16 text-center"><BookOpen className="text-[#8aa35f]" size={32} /><p role="alert">{error}</p><button type="button" onClick={() => { setError(""); setAttempt((value) => value + 1); }} className="rounded-full bg-[#1d2540] px-6 py-3 text-sm font-semibold text-white">Tentar novamente</button></div>}
          {menu && <>
            <div><div className="mx-auto max-w-5xl px-6 py-9 sm:px-8 sm:py-12">
              {menu.content.cover_media_id && menu.media_paths[menu.content.cover_media_id]?.main && <div role="img" aria-label="Capa do restaurante" className="mb-6 h-40 w-full rounded-xl bg-cover bg-center sm:h-56" style={{ backgroundImage: `url(${JSON.stringify(new URL(menu.media_paths[menu.content.cover_media_id].main, new URL(API_URL).origin).href)})` }} />}
              {menu.content.logo_media_id && menu.media_paths[menu.content.logo_media_id]?.thumb && <div role="img" aria-label="Logo do restaurante" className="mb-4 h-16 w-16 rounded-full bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(new URL(menu.media_paths[menu.content.logo_media_id].thumb, new URL(API_URL).origin).href)})` }} />}
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: palette.primary }}>Bem-vindo à mesa</p>
              <h3 className="text-3xl font-bold tracking-tight sm:text-4xl">{menu.content.display_name}</h3>
              <p className="mt-3 max-w-md text-sm leading-6 opacity-75">{menu.content.description || "Explore nosso cardápio e encontre seu próximo favorito."}</p>

            </div></div>
            <div className="mx-auto max-w-5xl px-5 pb-12 pt-7 sm:px-8">
              {menu.content.categories.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Ainda não há itens neste cardápio.</p>}
              {menu.content.categories.map((category) => <section key={category.id} className="mb-9">
                <div className="mb-4"><h4 className="text-xl font-bold tracking-tight">{category.name}</h4>{category.description && <p className="mt-1 text-sm text-slate-500">{category.description}</p>}</div>
                <div className={`grid gap-3 ${appearance?.layout === "grid" ? "md:grid-cols-2" : ""}`}>{category.products.map((product) => {
                  const variants = product.variants.filter((variant) => menu.availability[variant.id] !== false);
                  const available = menu.availability[product.id] !== false && variants.length > 0;
                  const price = Math.min(...(variants.length ? variants : product.variants).map((variant) => variant.price_cents));
                  const path = menu.media_paths[product.images[0]?.media_id]?.thumb;
                  const photo = path ? new URL(path, new URL(API_URL).origin).href : undefined;
                  return <article key={product.id} className="flex gap-4 p-4 shadow-sm" style={{ backgroundColor: palette.surface, borderRadius: radius }}>
                    <div className="min-w-0 flex-1"><h5 className="font-bold">{product.name}</h5>{product.description && <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{product.description}</p>}<p className="mt-3 text-sm font-bold" style={{ color: palette.primary }}>{available ? `${product.variants.length > 1 ? "A partir de " : ""}${money.format(price / 100)}` : "Indisponível"}{available && menu.customer_ordering_enabled && <button type="button" onClick={(event) => { event.stopPropagation(); setSelected(product.id); }} className="ml-3 underline">Adicionar ao pedido</button>}</p></div>
                    {photo ? <div className="h-20 w-20 shrink-0 rounded-xl bg-cover bg-center" role="img" aria-label={product.images[0].alt_text || product.name} style={{ backgroundImage: `url(${JSON.stringify(photo)})` }} /> : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-[#f1f5eb] text-[#a5b793]"><BookOpen size={24} /></div>}
                  </article>;
                })}</div>
              </section>)}
            </div>
          </>}
        </div>
        {menu && <OrderPanel code={code} token={token} menu={menu} selected={selected} onSelected={setSelected} />}
      </div>
    </dialog>
  );
}
