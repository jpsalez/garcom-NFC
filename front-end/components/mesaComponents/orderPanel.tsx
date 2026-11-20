'use client'

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { clearDevice } from "@/lib/device";
import type { PublicMenu } from "@/lib/menuTypes";
import type { OrderSubmission } from "@/lib/orderTypes";
import { submitOrder } from "@/services/orders";
import type { DeviceOrderFeed } from "@/hooks/useDeviceOrders";
import { DeviceOrderHistory, DeviceOrderSummary } from "./deviceOrderStatus";

type Product = PublicMenu["content"]["categories"][number]["products"][number];
type Line = OrderSubmission["items"][number] & { name: string; variant: string; total: number; choices: string[] };
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const button = "rounded-xl bg-[#1d2540] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50";

function ProductChoice({ product, menu, onAdd, onClose }: { product: Product; menu: PublicMenu; onAdd: (line: Line) => void; onClose: () => void }) {
  const variants = product.variants.filter((variant) => menu.availability[variant.id] !== false);
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const variant = variants.find((item) => item.id === variantId);
  const groups = (product.groups ?? []).filter((group) => variant?.group_ids.includes(group.id));
  const total = (variant?.price_cents ?? 0) + groups.flatMap((group) => group.options).reduce((sum, option) => sum + option.price_delta_cents * (choices[option.id] ?? 0), 0);
  function add() {
    if (!variant) return;
    if (groups.some((group) => { const count = group.options.reduce((sum, option) => sum + (choices[option.id] ?? 0), 0); return count < group.min_selections || count > group.max_selections; })) {
      setError("Confira a quantidade de escolhas em cada grupo."); return;
    }
    const options = groups.flatMap((group) => group.options).filter((option) => choices[option.id]);
    onAdd({ product_id: product.id, variant_id: variant.id, quantity, selections: options.map((option) => ({ option_id: option.id, quantity: choices[option.id] })), notes: notes.trim() || undefined, name: product.name, variant: variant.name, total: total * quantity, choices: options.map((option) => `${choices[option.id]}× ${option.name}`) });
  }
  return <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label={`Escolher ${product.name}`}>
    <div className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-6 text-slate-900 sm:rounded-3xl">
      <div className="flex justify-between gap-4"><h3 className="text-xl font-bold">{product.name}</h3><button type="button" onClick={onClose} aria-label="Fechar detalhes">✕</button></div>
      {product.description && <p className="mt-2 text-sm text-slate-600">{product.description}</p>}
      <fieldset className="mt-5 space-y-2"><legend className="font-bold">Escolha uma opção</legend>{variants.map((item) => <label key={item.id} className="flex justify-between gap-3 rounded-xl border p-3"><span><input type="radio" name="variant" checked={variantId === item.id} onChange={() => { setVariantId(item.id); setChoices({}); }} /> {item.name}</span><span>{money(item.price_cents)}</span></label>)}</fieldset>
      {groups.map((group) => <fieldset key={group.id} className="mt-5 space-y-2"><legend className="font-bold">{group.name}</legend><p className="text-xs text-slate-600">Escolha de {group.min_selections} até {group.max_selections}</p>{group.options.map((option) => <label key={option.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><span>{option.name} {option.price_delta_cents !== 0 && `(${money(option.price_delta_cents)})`}{menu.availability[option.id] === false && " · Indisponível"}</span><input aria-label={`Quantidade de ${option.name}`} type="number" min="0" max={Math.min(option.max_quantity, group.max_selections)} value={choices[option.id] ?? 0} disabled={menu.availability[option.id] === false} onChange={(event) => setChoices({ ...choices, [option.id]: Math.min(option.max_quantity, group.max_selections, Math.max(0, Number(event.target.value) || 0)) })} className="w-16 rounded border p-1 text-center" /></label>)}</fieldset>)}
      <label className="mt-5 block font-bold">Observações <span className="font-normal text-slate-500">(opcional)</span><textarea value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} className="mt-2 block w-full rounded-xl border p-3 font-normal" placeholder="Ex.: sem cebola" /></label>
      <label className="mt-4 block">Quantidade <input type="number" min="1" max="20" value={quantity} onChange={(event) => setQuantity(Math.min(20, Math.max(1, Number(event.target.value) || 1)))} className="ml-3 w-16 rounded border p-1" /></label>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <button type="button" onClick={add} className={`${button} mt-5 w-full`}>Adicionar ao pedido · {money(total * quantity)}</button>
    </div>
  </div>;
}

export default function OrderPanel({ code, token, menu, selected, onSelected, feed }: { code: string; token: string; menu: PublicMenu; selected: string | null; onSelected: (id: string | null) => void; feed: DeviceOrderFeed }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [view, setView] = useState<"menu" | "review" | "history">("menu");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<OrderSubmission | null>(null);
  const [previousSession, setPreviousSession] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const key = `pending-order:${code}`;
  const product = menu.content.categories.flatMap((category) => category.products).find((item) => item.id === selected);
  useEffect(() => {
    Promise.resolve().then(() => { try { const saved = JSON.parse(sessionStorage.getItem(key) ?? "null"); if (saved?.body) { if (saved.token === token) setPending(saved.body); else setPreviousSession(true); } } catch { sessionStorage.removeItem(key); } });
  }, [key, token]);
  async function send() {
    if (busy || previousSession || (!pending && !lines.length)) return;
    const body = pending ?? { submission_key: crypto.randomUUID(), publication_id: menu.publication_id, items: lines.map(({ product_id, variant_id, quantity, selections, notes }) => ({ product_id, variant_id, quantity, selections, notes })) };
    try { sessionStorage.setItem(key, JSON.stringify({ token, body })); } catch { setError("Não foi possível guardar a confirmação do pedido neste navegador. Verifique as configurações de armazenamento antes de enviar."); return; }
    setPending(body); setBusy(true); setError("");
    try { await submitOrder(token, body); sessionStorage.removeItem(key); setPending(null); setLines([]); feed.refresh(); setView("history"); }
    catch (err) {
      if (err instanceof ApiError && err.status === 401) { setSessionExpired(true); setError("A sessão da mesa encerrou. Reinicie o atendimento e consulte a equipe sobre o envio anterior antes de fazer outro pedido."); }
      else if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429) { sessionStorage.removeItem(key); setPending(null); setError("Não foi possível enviar: o cardápio ou a disponibilidade pode ter mudado. Atualize a página e confira os itens."); }
      else setError("Não foi possível confirmar o envio. Tente novamente: o mesmo pedido será reutilizado para evitar duplicidade.");
    } finally { setBusy(false); }
  }
  return <>
    <div className="shrink-0 space-y-2 border-t bg-white p-3 text-slate-900">
      {view === "menu" && !product && <DeviceOrderSummary feed={feed} code={code} />}
      <div className="flex gap-2">
        <button type="button" onClick={() => { setView("history"); setError(""); feed.refresh(); }}
          className="flex-1 rounded-lg border p-3 text-sm font-semibold">Meus pedidos</button>
        {(menu.customer_ordering_enabled || lines.length > 0 || pending) &&
          <button type="button" onClick={() => { setView("review"); setError(""); }} className={`${button} flex-1`}>
            Revisar pedido {lines.length > 0 && `(${lines.length})`}
          </button>}
      </div>
    </div>
    {product && <ProductChoice key={product.id} product={product} menu={menu} onClose={() => onSelected(null)} onAdd={(line) => { if (previousSession) { setError("Um envio anterior não foi confirmado e a sessão mudou. Consulte a equipe antes de fazer um novo pedido."); setView("review"); } else if (pending) { setError("Confirme o envio anterior antes de adicionar mais itens."); setView("review"); } else if (lines.length < 50) setLines([...lines, line]); else { setError("O pedido pode conter até 50 itens."); setView("review"); } onSelected(null); }} />}
    {view !== "menu" && <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label={view === "review" ? "Revisar pedido" : "Meus pedidos"}><div className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-6 text-slate-900 sm:rounded-3xl"><div className="flex items-center justify-between"><h3 className="text-xl font-bold">{view === "review" ? "Revisar pedido" : "Meus pedidos"}</h3><button type="button" onClick={() => setView("menu")} aria-label="Voltar ao cardápio">✕</button></div>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {view === "review" && sessionExpired && !feed.expired && <button type="button" className="mt-3 rounded-xl border px-4 py-3 text-sm font-semibold" onClick={() => { clearDevice(code); window.location.reload(); }}>Reiniciar atendimento</button>}
      {view === "review" && <><p className="mt-3 text-sm text-slate-600">Confira os itens antes de enviar para o restaurante.</p>{previousSession && <div role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm"><p>Um envio anterior não foi confirmado e a sessão mudou. Consulte a equipe antes de fazer outro pedido.</p><button type="button" className="mt-3 font-semibold underline" onClick={() => { if (!window.confirm("Você confirmou com a equipe a situação do pedido anterior? Esta ação libera um novo pedido e não reenvia o anterior.")) return; try { sessionStorage.removeItem(key); setPreviousSession(false); setError(""); } catch { setError("Não foi possível liberar a pendência neste navegador. Peça ajuda à equipe."); } }}>Já confirmei com a equipe</button></div>}{pending && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm">Há um envio aguardando confirmação. Repita o envio para verificar o resultado com segurança.</p>}{lines.map((line, index) => <div key={index} className="mt-3 rounded-xl border p-4"><div className="flex justify-between gap-4"><strong>{line.quantity}× {line.name}</strong><span>{money(line.total)}</span></div><p className="mt-1 text-sm text-slate-600">{line.variant}{line.choices.length > 0 && ` · ${line.choices.join(", ")}`}</p>{line.notes && <p className="text-sm">Obs.: {line.notes}</p>}<button type="button" disabled={!!pending} onClick={() => setLines(lines.filter((_, i) => i !== index))} className="mt-2 text-sm underline disabled:opacity-40">Remover</button></div>)}{!lines.length && !pending && <p className="mt-5 text-sm">Escolha produtos no cardápio para montar seu pedido.</p>}{lines.length > 0 && <p className="mt-4 text-right font-bold">Total estimado: {money(lines.reduce((sum, line) => sum + line.total, 0))}</p>}<button type="button" onClick={send} disabled={busy || sessionExpired || feed.expired || previousSession || (!lines.length && !pending)} className={`${button} mt-5 w-full`}>{busy ? "Enviando..." : pending ? "Confirmar envio novamente" : "Enviar pedido"}</button></>}
      {view === "history" && <div className="mt-3">
        <DeviceOrderSummary feed={feed} code={code} />
        <DeviceOrderHistory feed={feed} />
      </div>}
      {view === "review" && feed.expired && <DeviceOrderSummary feed={feed} code={code} />}
    </div></div>}
  </>;
}
