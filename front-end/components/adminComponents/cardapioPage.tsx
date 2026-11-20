'use client'

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import type { MenuDraft, MenuPresentation } from "@/lib/menuTypes";
import { createMenuCategory, createMenuProduct, getMenuDraft, publishMenu, setProductImages, unpublishMenu, updateMenu, uploadMenuMedia } from "@/services/menu";
import { getOrderingSettings, updateOrderingSettings } from "@/services/orders";
import MenuImage from "@/components/adminComponents/menuImage";
import MenuManagement from "@/components/adminComponents/menuManagement";
import type { OrderingSettings } from "@/lib/orderTypes";

const defaults: MenuPresentation = { palette: { primary: "#8dbf21", background: "#dbdbdb", surface: "#ffffff", text: "#1d2540" }, typography: "sans", layout: "list", border_radius: "medium" };
const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2";
const button = "rounded-lg bg-[#1d2540] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

export default function CardapioPage() {
  const [tab, setTab] = useState<"produtos" | "visual" | "publicar">("produtos");
  const [draft, setDraft] = useState<MenuDraft | null>(null);
  const [settings, setSettings] = useState<OrderingSettings | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [presentation, setPresentation] = useState<MenuPresentation>(defaults);
  const [category, setCategory] = useState("");
  const [product, setProduct] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [menu, config] = await Promise.all([getMenuDraft(), getOrderingSettings()]);
      setDraft(menu); setSettings(config); setName(menu.display_name); setDescription(menu.description ?? "");
      setPresentation(menu.presentation_config.palette ? menu.presentation_config as MenuPresentation : defaults);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? "Você não tem permissão para editar o cardápio." : "Não foi possível carregar o cardápio. Tente novamente.");
    } finally { setLoaded(true); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function act(task: () => Promise<void>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await task(); setNotice(message); }
    catch (err) {
      setError(err instanceof ApiError && err.code === "DRAFT_VERSION_CONFLICT"
        ? "O cardápio foi alterado em outra sessão. Recarregue antes de salvar novamente."
        : err instanceof ApiError ? err.message : "Não foi possível concluir. Verifique a conexão.");
    } finally { setBusy(false); }
  }

  function saveIdentity(e: FormEvent) {
    e.preventDefault(); if (!draft) return;
    void act(async () => { setDraft(await updateMenu({ expected_draft_version: draft.draft_version, display_name: name, description: description || null, presentation_config: presentation })); }, "Aparência salva no rascunho.");
  }
  function addCategory(e: FormEvent) {
    e.preventDefault(); if (!draft) return;
    void act(async () => { setDraft(await createMenuCategory({ expected_draft_version: draft.draft_version, name: category })); setCategory(""); }, "Categoria adicionada ao rascunho.");
  }
  function addProduct(e: FormEvent) {
    e.preventDefault(); if (!draft) return;
    const cents = Math.round(Number(price.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 0) { setError("Informe um preço válido."); return; }
    void act(async () => { setDraft(await createMenuProduct({ expected_draft_version: draft.draft_version, category_id: productCategory, name: product, initial_variant: { name: "Único", price_cents: cents } })); setProduct(""); setPrice(""); }, "Produto adicionado ao rascunho.");
  }
  function uploadImage(file: File | undefined, target: "logo" | "cover" | string) {
    if (!file || !draft) return;
    void act(async () => {
      const image = await uploadMenuMedia(file);
      if (target === "logo" || target === "cover") {
        setDraft(await updateMenu({ expected_draft_version: draft.draft_version, [target === "logo" ? "logo_media_id" : "cover_media_id"]: image.id }));
      } else {
        const current = draft.categories.flatMap((category) => category.products).find((product) => product.id === target);
        const remaining = current?.images.slice(1).map(({ media_id, alt_text }) => ({ media_id, alt_text })) ?? [];
        setDraft(await setProductImages(target, { expected_draft_version: draft.draft_version, items: [{ media_id: image.id }, ...remaining] }));
      }
    }, "Imagem salva. Publique o cardápio para que os clientes possam vê-la.");
  }
  if (!loaded) return <p className="p-6">Carregando cardápio...</p>;
  if (!draft || !settings) return <div className="space-y-4 p-6"><p role="alert">{error}</p><button className={button} onClick={() => { setError(""); setLoaded(false); void load(); }}>Tentar novamente</button></div>;
  const activeCategories = draft.categories.filter((item) => !item.archived_at);

  return <main className="mx-auto w-full max-w-6xl space-y-8 p-5 pb-16 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#719047]">Seu restaurante</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Seu cardápio</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Tudo que você precisa para apresentar seus produtos e receber seus clientes à mesa.</p></div><span className={`rounded-full px-4 py-2 text-xs font-semibold ${draft.published_revision_id ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>{draft.published_revision_id ? "● Visível para clientes" : "● Ainda não publicado"}</span></div>
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error} {error.includes("outra sessão") && <button className="underline" onClick={() => void load()}>Recarregar rascunho</button>}</div>}
    {notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    <nav aria-label="Etapas do cardápio" className="grid grid-cols-3 gap-1 border-b border-slate-200 sm:gap-4">
      {([{ id: "produtos", title: "1. Produtos" }, { id: "visual", title: "2. Aparência" }, { id: "publicar", title: "3. Publicar" }] as const).map((item) => <button type="button" key={item.id} aria-current={tab === item.id ? "step" : undefined} onClick={() => setTab(item.id)} className={`border-b-2 px-2 py-4 text-sm font-semibold ${tab === item.id ? "border-[#7cae22] text-[#1d2540]" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{item.title}</button>)}
    </nav>
    <div hidden={tab !== "visual"}><div className="grid items-start gap-6 lg:grid-cols-2">
    <form onSubmit={saveIdentity} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div><h2 className="text-xl font-bold">Deixe o cardápio com a sua cara</h2><p className="text-sm text-slate-500">Altere as opções e acompanhe a prévia abaixo. Depois salve e publique para mostrar aos clientes.</p></div>
      <div className="space-y-4"><label className="block space-y-1 text-sm font-medium">Nome do cardápio<input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></label><label className="block space-y-1 text-sm font-medium">Descrição<input className={field} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} /></label></div>
      <details className="group border-t border-slate-100 pt-5"><summary className="cursor-pointer list-none font-semibold">Imagens do restaurante <span className="float-right text-slate-400 group-open:rotate-45">＋</span></summary><p className="mt-1 text-sm text-slate-500">Adicione sua marca e uma foto de capa.</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{([{ id: "logo", label: "Logo do restaurante", help: "A marca que aparece junto ao nome.", image: draft.logo_media_id }, { id: "cover", label: "Imagem de capa", help: "Uma imagem de destaque no início do cardápio.", image: draft.cover_media_id }] as const).map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-4"><p className="font-semibold">{item.label}</p><p className="mt-1 text-xs text-slate-500">{item.help} JPG, PNG ou WebP, até 8 MB.</p>{item.image && <MenuImage key={item.image} id={item.image} alt={item.label} className="mt-3 block h-20 w-32 rounded-lg" />}<label className="mt-3 inline-flex cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">{item.image ? "Trocar imagem" : "Escolher imagem"}<input disabled={busy} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { uploadImage(event.target.files?.[0], item.id); event.target.value = ""; }} /></label></div>)}</div></details>
      <details className="group border-t border-slate-100 pt-5"><summary className="cursor-pointer list-none font-semibold">Cores <span className="float-right text-slate-400 group-open:rotate-45">＋</span></summary><p className="mt-1 text-sm text-slate-500">Escolha as cores que combinam com o seu restaurante.</p><div className="mt-4 grid grid-cols-2 gap-4">{([['primary', 'Destaques', 'Cor dos preços e pequenos detalhes'], ['background', 'Fundo do cardápio', 'Cor atrás dos produtos'], ['surface', 'Fundo dos produtos', 'Cor das caixas de cada item'], ['text', 'Textos', 'Cor dos nomes e descrições']] as const).map(([key, label, help]) => <label key={key} className="space-y-1 text-sm font-medium">{label}<span className="block min-h-8 text-xs font-normal text-slate-500">{help}</span><span className="flex items-center gap-2 rounded-lg border border-slate-200 p-2"><input aria-label={label} type="color" value={presentation.palette[key]} onChange={(e) => setPresentation({ ...presentation, palette: { ...presentation.palette, [key]: e.target.value } })} className="h-9 w-10 cursor-pointer border-0 bg-transparent p-0" /><span className="text-xs uppercase text-slate-500">{presentation.palette[key]}</span></span></label>)}</div></details>
      <details className="group border-t border-slate-100 pt-5"><summary className="cursor-pointer list-none font-semibold">Letras e formato <span className="float-right text-slate-400 group-open:rotate-45">＋</span></summary><p className="mt-1 text-sm text-slate-500">Ajuste a organização e o estilo dos itens.</p><div className="mt-4 grid gap-4">{([{ key: 'typography', label: 'Estilo das letras', help: 'Escolha o formato dos textos.', options: [['sans', 'Simples'], ['serif', 'Clássico'], ['mono', 'Máquina de escrever']] }, { key: 'layout', label: 'Organização dos produtos', help: 'Em telas maiores, escolha como os itens aparecem.', options: [['list', 'Um abaixo do outro'], ['grid', 'Lado a lado']] }, { key: 'border_radius', label: 'Cantos das caixas', help: 'Escolha o formato das caixas dos produtos.', options: [['none', 'Retos'], ['small', 'Pouco arredondados'], ['medium', 'Arredondados'], ['large', 'Bem arredondados']] }] as const).map(({ key, label, help, options }) => <label key={key} className="space-y-1 text-sm font-medium">{label}<span className="block min-h-8 text-xs font-normal text-slate-500">{help}</span><select className={field} value={presentation[key]} onChange={(e) => setPresentation({ ...presentation, [key]: e.target.value })}>{options.map(([value, title]) => <option value={value} key={value}>{title}</option>)}</select></label>)}</div></details>
      <div className="border-t border-slate-100 pt-5"><button disabled={busy} className={button}>Salvar aparência</button><p className="mt-2 text-xs text-slate-500">Depois de salvar, publique para mostrar as mudanças aos clientes.</p></div>
    </form>
    <section aria-label="Prévia do cardápio" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-5">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold">Prévia do cardápio</h2><p className="text-xs text-slate-500">Acompanhe as mudanças enquanto edita.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Prévia</span></div>
      <div className="p-5 sm:p-7" style={{ backgroundColor: presentation.palette.background, color: presentation.palette.text, fontFamily: presentation.typography === "serif" ? "serif" : presentation.typography === "mono" ? "monospace" : "sans-serif" }}>
        {draft.cover_media_id && <MenuImage key={draft.cover_media_id} id={draft.cover_media_id} alt="Imagem de capa" className="mb-5 block h-36 w-full rounded-xl" />}{draft.logo_media_id && <MenuImage key={draft.logo_media_id} id={draft.logo_media_id} alt="Logo do restaurante" className="mb-4 block h-16 w-16 rounded-full" />}<p className="text-xs font-bold uppercase tracking-widest" style={{ color: presentation.palette.primary }}>Bem-vindo à mesa</p><h3 className="mt-2 text-2xl font-bold">{name || "Nome do seu restaurante"}</h3><p className="mt-2 text-sm opacity-75">{description || "Uma breve descrição do seu restaurante aparece aqui."}</p>
        <div className="mt-6 space-y-5">{(activeCategories.length ? activeCategories : [{ id: "example", name: "Pratos principais", products: [] }]).map((group) => <div key={group.id}><h4 className="mb-3 font-bold">{group.name}</h4><div className={`grid gap-3 ${presentation.layout === "grid" ? "sm:grid-cols-2" : ""}`}>{(group.products.filter((p) => !p.archived_at).length ? group.products.filter((p) => !p.archived_at).slice(0, 3) : [{ id: "example", name: "Exemplo de produto", description: "A descrição do produto aparece aqui.", variants: [] }]).map((item) => <div key={item.id} className="p-4" style={{ backgroundColor: presentation.palette.surface, borderRadius: ({ none: "0", small: "4px", medium: "12px", large: "24px" })[presentation.border_radius] }}>{"images" in item && item.images[0] && <MenuImage key={item.images[0].media_id} id={item.images[0].media_id} alt={`Foto de ${item.name}`} className="mb-3 block h-24 w-full rounded-lg" />}<p className="font-bold">{item.name}</p><p className="mt-1 text-sm opacity-70">{item.description || "Uma descrição para o seu produto."}</p><p className="mt-3 text-sm font-bold" style={{ color: presentation.palette.primary }}>{item.variants.length ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.variants[0].price_cents / 100) : "R$ 29,90"}</p></div>)}</div></div>)}</div>
      </div>
      {!activeCategories.length && <p className="px-5 py-3 text-xs text-slate-500">Este produto é apenas um exemplo. Adicione seus produtos na primeira etapa.</p>}
    </section>
    </div></div>
    <section hidden={tab !== "produtos"} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div><h2 className="text-xl font-bold">O que você oferece?</h2><p className="text-sm text-slate-500">Crie grupos como “Bebidas” ou “Pratos principais” e adicione os itens em cada um.</p></div>
      <details className="group rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer list-none font-semibold">＋ Criar categoria <span className="block pt-1 text-xs font-normal text-slate-500">Por exemplo: entradas, pratos ou bebidas</span></summary><form onSubmit={addCategory} className="mt-4 flex flex-wrap items-end gap-3"><label className="min-w-48 flex-1 text-sm font-medium">Nova categoria<input className={field} value={category} onChange={(e) => setCategory(e.target.value)} maxLength={120} required placeholder="Ex.: Pratos principais" /></label><button disabled={busy} className={button}>Adicionar categoria</button></form></details>
      <details className="group rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer list-none font-semibold">＋ Adicionar produto <span className="block pt-1 text-xs font-normal text-slate-500">Escolha uma categoria e informe nome e preço</span></summary><form onSubmit={addProduct} className="mt-4 grid gap-3 sm:grid-cols-2 sm:items-end"><label className="text-sm font-medium">Categoria<select className={field} value={productCategory} onChange={(e) => setProductCategory(e.target.value)} required><option value="">Selecione</option>{activeCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium">Produto<input className={field} value={product} onChange={(e) => setProduct(e.target.value)} maxLength={120} required placeholder="Nome do produto" /></label><label className="text-sm font-medium">Preço (R$)<input className={field} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" required placeholder="0,00" /></label><button disabled={busy || !activeCategories.length} className={button}>Adicionar produto</button></form></details>
      {activeCategories.length === 0 ? <p className="text-sm text-slate-500">Seu cardápio está vazio. Comece criando uma categoria acima.</p> : <div className="space-y-4 border-t border-slate-100 pt-4">{activeCategories.map((item) => <div key={item.id}><h3 className="font-bold">{item.name}</h3>{item.products.filter((p) => !p.archived_at).length ? <ul className="mt-2 space-y-1 text-sm text-slate-600">{item.products.filter((p) => !p.archived_at).map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"><span className="flex items-center gap-3">{p.images[0] && <MenuImage key={p.images[0].media_id} id={p.images[0].media_id} alt={`Foto de ${p.name}`} className="block h-12 w-12 rounded-lg" />}<span>{p.name} · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((p.variants.find((v) => !v.archived_at)?.price_cents ?? 0) / 100)}</span></span><label className="cursor-pointer rounded-lg border bg-white px-3 py-2 text-xs font-medium">{p.images.length ? "Trocar foto" : "Adicionar foto"}<input disabled={busy} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { uploadImage(event.target.files?.[0], p.id); event.target.value = ""; }} /></label></li>)}</ul> : <p className="mt-1 text-sm text-slate-400">Sem produtos ainda.</p>}</div>)}</div>}
      <div className="border-t border-slate-100 pt-4"><h2 className="mb-3 text-lg font-bold">Organizar e editar</h2><MenuManagement draft={draft} busy={busy} setDraft={setDraft} act={act} /></div>
    </section>
    <section hidden={tab !== "publicar"} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-xl font-bold">Mostre seu cardápio aos clientes</h2><p className="text-sm text-slate-500">Ao publicar, os clientes veem a versão salva. Alterações posteriores só aparecem após uma nova publicação. Escolha também se aceita pedidos pela mesa.</p><div className="flex flex-wrap gap-3"><button disabled={busy} className={button} onClick={() => void act(async () => { const result = await publishMenu({ expected_draft_version: draft.draft_version }); setDraft({ ...draft, published_revision_id: result.publication_id }); }, "Cardápio publicado.")}>Publicar cardápio</button>{draft.published_revision_id && <button disabled={busy} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" onClick={() => void act(async () => { await unpublishMenu(draft.published_revision_id!); setDraft({ ...draft, published_revision_id: null }); }, "Cardápio retirado da publicação.")}>Retirar publicação</button>}<button disabled={busy} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" onClick={() => void act(async () => { setSettings(await updateOrderingSettings({ expected_version: settings.version, customer_ordering_enabled: !settings.customer_ordering_enabled })); }, "Configuração de pedidos atualizada.")}>{settings.customer_ordering_enabled ? "Desativar pedidos" : "Ativar pedidos"}</button></div><p className="text-sm">Pedidos: <strong>{settings.customer_ordering_enabled ? "ativados" : "desativados"}</strong></p></section>
  </main>;
}
