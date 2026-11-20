'use client'

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import type { PublicMenu } from "@/lib/menuTypes";
import { formatTableTab } from "@/lib/orderTypes";
import {
  addPdvItem,
  clearPdvCart,
  createPdvDraft,
  pdvCartTotalCents,
  removePdvItem,
  selectPdvTable,
  submitPdvDraft,
  updatePdvItemQuantity,
  type PdvCartItem,
  type PdvDraftState,
} from "@/lib/pdvState";
import type { ActiveSession, Table } from "@/lib/types";
import { createPosOrder, getPublishedMenuForStaff } from "@/services/orders";
import { listSessions } from "@/services/sessions";
import { listTables } from "@/services/tables";

type MenuProduct = PublicMenu["content"]["categories"][number]["products"][number];

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function ProductModal({
  product,
  menu,
  onAdd,
  onClose,
}: {
  product: MenuProduct;
  menu: PublicMenu;
  onAdd: (item: PdvCartItem) => void;
  onClose: () => void;
}) {
  const variants = product.variants.filter((variant) => menu.availability[variant.id] !== false);
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const variant = variants.find((item) => item.id === variantId);
  const groups = (product.groups ?? []).filter((group) => variant?.group_ids.includes(group.id));
  const optionsTotal = groups
    .flatMap((group) => group.options)
    .reduce((sum, option) => sum + option.price_delta_cents * (choices[option.id] ?? 0), 0);
  const unitPriceCents = (variant?.price_cents ?? 0) + optionsTotal;

  function handleAdd() {
    if (!variant) return;
    const invalidGroup = groups.find((group) => {
      const count = group.options.reduce((sum, option) => sum + (choices[option.id] ?? 0), 0);
      return count < group.min_selections || count > group.max_selections;
    });
    if (invalidGroup) {
      setError(`Confira a quantidade de escolhas em "${invalidGroup.name}".`);
      return;
    }

    const selectedOptions = groups
      .flatMap((group) => group.options)
      .filter((option) => (choices[option.id] ?? 0) > 0)
      .map((option) => ({
        option_id: option.id,
        name: option.name,
        quantity: choices[option.id] ?? 0,
        price_delta_cents: option.price_delta_cents,
      }));

    onAdd({
      id: crypto.randomUUID(),
      product_id: product.id,
      variant_id: variant.id,
      product_name: product.name,
      variant_name: variant.name,
      unit_price_cents: unitPriceCents,
      quantity,
      notes: notes.trim() || undefined,
      options: selectedOptions,
    });
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Configurar ${product.name}`}
    >
      <div className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-6 text-slate-900 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold">{product.name}</h3>
            {product.description && <p className="mt-1 text-sm text-slate-600">{product.description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes do produto"
            className="rounded-lg border px-2.5 py-1 text-sm"
          >
            ✕
          </button>
        </div>

        <fieldset className="mt-5 space-y-2">
          <legend className="text-sm font-bold">Tamanho / variação</legend>
          {variants.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="pdv-variant"
                  checked={variantId === item.id}
                  onChange={() => {
                    setVariantId(item.id);
                    setChoices({});
                    setError("");
                  }}
                />
                {item.name}
              </span>
              <span className="text-sm font-semibold tabular-nums">{money.format(item.price_cents / 100)}</span>
            </label>
          ))}
        </fieldset>

        {groups.map((group) => (
          <fieldset key={group.id} className="mt-5 space-y-2">
            <legend className="text-sm font-bold">{group.name}</legend>
            <p className="text-xs text-slate-500">
              Escolha de {group.min_selections} até {group.max_selections}
            </p>
            {group.options.map((option) => {
              const unavailable = menu.availability[option.id] === false;
              const maxAllowed = Math.min(option.max_quantity, group.max_selections);
              return (
                <label
                  key={option.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
                >
                  <span className="text-sm">
                    {option.name}{" "}
                    {option.price_delta_cents !== 0 && (
                      <span className="text-slate-600">({money.format(option.price_delta_cents / 100)})</span>
                    )}
                    {unavailable && <span className="ml-1 text-xs font-semibold text-red-700">· Indisponível</span>}
                  </span>
                  <input
                    aria-label={`Quantidade de ${option.name}`}
                    type="number"
                    min={0}
                    max={maxAllowed}
                    disabled={unavailable}
                    value={choices[option.id] ?? 0}
                    onChange={(event) => {
                      const next = Math.min(maxAllowed, Math.max(0, Number(event.target.value) || 0));
                      setChoices({ ...choices, [option.id]: next });
                    }}
                    className="w-16 rounded border border-slate-300 p-1 text-center text-sm"
                  />
                </label>
              );
            })}
          </fieldset>
        ))}

        <div className="mt-5 grid gap-4 sm:grid-cols-[120px_1fr]">
          <label className="block text-sm font-bold">
            Quantidade
            <input
              type="number"
              min={1}
              max={20}
              value={quantity}
              onChange={(event) => setQuantity(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm font-normal"
            />
          </label>
          <label className="block text-sm font-bold">
            Observação <span className="font-normal text-slate-500">(opcional)</span>
            <textarea
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Ex.: sem cebola, ponto da carne..."
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm font-normal"
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleAdd}
          disabled={!variant}
          className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Adicionar ao carrinho · {money.format((unitPriceCents * quantity) / 100)}
        </button>
      </div>
    </div>
  );
}

export default function PdvPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [menuMissing, setMenuMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("ALL");
  const [selectedProduct, setSelectedProduct] = useState<MenuProduct | null>(null);
  const [draft, setDraft] = useState<PdvDraftState>(() => createPdvDraft());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const refreshTablesAndSessions = useCallback(async () => {
    const [nextTables, nextSessions] = await Promise.all([listTables(), listSessions()]);
    setTables(nextTables);
    setSessions(nextSessions);
  }, []);

  const refreshMenu = useCallback(async () => {
    try {
      const published = await getPublishedMenuForStaff();
      setMenu(published);
      setMenuMissing(false);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.code === "MENU_NOT_PUBLISHED")) {
        setMenu(null);
        setMenuMissing(true);
        return;
      }
      throw err;
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      await Promise.all([refreshTablesAndSessions(), refreshMenu()]);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Não foi possível carregar os dados do PDV.");
    } finally {
      setLoading(false);
    }
  }, [refreshMenu, refreshTablesAndSessions]);

  useEffect(() => {
    let active = true;
    Promise.all([
      listTables(),
      listSessions(),
      getPublishedMenuForStaff().then(
        (published) => ({ published, missing: false as const }),
        (err: unknown) => {
          if (err instanceof ApiError && (err.status === 404 || err.code === "MENU_NOT_PUBLISHED")) {
            return { published: null, missing: true as const };
          }
          throw err;
        },
      ),
    ])
      .then(([nextTables, nextSessions, menuResult]) => {
        if (!active) return;
        setTables(nextTables);
        setSessions(nextSessions);
        setMenu(menuResult.published);
        setMenuMissing(menuResult.missing);
        setLoadError("");
      })
      .catch((err) => {
        if (active) {
          setLoadError(err instanceof ApiError ? err.message : "Não foi possível carregar os dados do PDV.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeTables = useMemo(() => tables.filter((table) => table.active), [tables]);
  const sessionByTableId = useMemo(
    () => new Map(sessions.map((session) => [session.table.id, session])),
    [sessions],
  );
  const selectedTable = activeTables.find((table) => table.id === draft.tableId) ?? null;
  const selectedSession = selectedTable ? sessionByTableId.get(selectedTable.id) : undefined;

  const filteredCategories = useMemo(() => {
    if (!menu) return [];
    const term = search.trim().toLowerCase();
    return menu.content.categories
      .filter((category) => categoryId === "ALL" || category.id === categoryId)
      .map((category) => {
        if (!term) return category;
        const categoryMatches = category.name.toLowerCase().includes(term);
        if (categoryMatches) return category;
        return {
          ...category,
          products: category.products.filter(
            (product) =>
              product.name.toLowerCase().includes(term) ||
              (product.description ?? "").toLowerCase().includes(term),
          ),
        };
      })
      .filter((category) => category.products.length > 0);
  }, [menu, search, categoryId]);

  async function handleSubmit() {
    if (submitting || !menu || !selectedTable || draft.items.length === 0) return;
    setSubmitting(true);
    setSubmitError("");
    setConfirmation("");

    const outcome = await submitPdvDraft(draft, menu.publication_id, createPosOrder);
    setDraft(outcome.state);
    setSubmitting(false);

    if (outcome.ok) {
      const { order, replayed } = outcome.result;
      const label = formatTableTab(order.table_label, order.tab_number);
      setConfirmation(
        replayed
          ? `Pedido já registrado e confirmado na cozinha: ${label}.`
          : `Pedido enviado para a cozinha: ${label}.`,
      );
      void refreshTablesAndSessions().catch(() => {});
      return;
    }

    const err = outcome.error;
    if (err instanceof ApiError) {
      if (err.code === "MENU_REVISION_CHANGED") {
        setSubmitError("O cardápio foi atualizado. Revise os itens no carrinho antes de enviar novamente.");
        void refreshMenu().catch(() => {});
        return;
      }
      if (err.code === "TABLE_INACTIVE") {
        setSubmitError("Esta mesa está inativa. Selecione outra mesa ativa.");
        setDraft((prev) => selectPdvTable(prev, ""));
        void refreshTablesAndSessions().catch(() => {});
        return;
      }
      if (err.code === "MENU_NOT_ORDERABLE" || err.code === "ITEM_UNAVAILABLE") {
        setSubmitError(err.message);
        void refreshMenu().catch(() => {});
        return;
      }
      if (err.status === 403) {
        setSubmitError("Você não tem permissão para lançar pedidos no PDV.");
        return;
      }
      if (!outcome.uncertain) {
        setSubmitError(err.message);
        return;
      }
    }

    setSubmitError(
      "Não foi possível confirmar o envio. Tente novamente: a mesma chave será reutilizada para evitar duplicidade.",
    );
  }

  const totalCents = pdvCartTotalCents(draft.items);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-5 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#719047]">Atendimento</p>
          <h1 className="mt-1 text-3xl font-bold">PDV interno</h1>
          <p className="mt-1 text-sm text-slate-600">
            Lance pedidos diretamente para a cozinha na comanda da mesa.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAll()}
          disabled={loading}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </header>

      {loadError && (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {loadError}
        </p>
      )}

      {confirmation && (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          {confirmation}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">1. Selecione a mesa</h2>
        {loading && activeTables.length === 0 ? (
          <p role="status" className="text-sm text-slate-500">
            Carregando mesas...
          </p>
        ) : activeTables.length === 0 ? (
          <p className="rounded-2xl border bg-white p-5 text-sm text-slate-600">
            Nenhuma mesa ativa encontrada.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {activeTables.map((table) => {
              const session = sessionByTableId.get(table.id);
              const selected = draft.tableId === table.id;
              return (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => {
                    setDraft((prev) => selectPdvTable(prev, table.id));
                    setConfirmation("");
                    setSubmitError("");
                  }}
                  aria-pressed={selected}
                  className={`rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-900 hover:border-slate-400"
                  }`}
                >
                  <p className="text-base font-bold">{table.label}</p>
                  <p className={`mt-1 text-xs ${selected ? "text-slate-200" : "text-slate-600"}`}>
                    {session
                      ? session.tab_number != null
                        ? `Comanda #${session.tab_number} aberta`
                        : "Comanda aberta"
                      : "Sem comanda · abre ao lançar"}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">2. Cardápio publicado</h2>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar produto ou categoria..."
              aria-label="Buscar no cardápio"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:w-64"
            />
          </div>

          {menuMissing ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
              <p className="font-semibold">Nenhum cardápio publicado no momento.</p>
              <p className="mt-1">Publique o cardápio na aba Cardápio antes de lançar pedidos no PDV.</p>
            </div>
          ) : !menu ? (
            !loadError && (
              <p role="status" className="text-sm text-slate-500">
                Carregando cardápio...
              </p>
            )
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCategoryId("ALL")}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    categoryId === "ALL" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  Todas
                </button>
                {menu.content.categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setCategoryId(category.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      categoryId === category.id
                        ? "bg-slate-900 text-white"
                        : "border border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>

              {filteredCategories.length === 0 ? (
                <p className="rounded-2xl border bg-white p-6 text-center text-sm text-slate-500">
                  Nenhum produto encontrado para o filtro informado.
                </p>
              ) : (
                <div className="space-y-6">
                  {filteredCategories.map((category) => (
                    <div key={category.id} className="space-y-3">
                      <h3 className="text-base font-bold text-slate-800">{category.name}</h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {category.products.map((product) => {
                          const availableVariants = product.variants.filter(
                            (variant) => menu.availability[variant.id] !== false,
                          );
                          const isAvailable =
                            menu.availability[product.id] !== false && availableVariants.length > 0;
                          const minPrice = Math.min(
                            ...(availableVariants.length ? availableVariants : product.variants).map(
                              (variant) => variant.price_cents,
                            ),
                          );
                          return (
                            <article
                              key={product.id}
                              className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 ${
                                isAvailable
                                  ? "border-slate-200 bg-white shadow-sm"
                                  : "border-slate-200 bg-slate-50 text-slate-500"
                              }`}
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="font-bold">{product.name}</h4>
                                  {!isAvailable && (
                                    <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                                      Indisponível
                                    </span>
                                  )}
                                </div>
                                {product.description && (
                                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">{product.description}</p>
                                )}
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold tabular-nums text-slate-900">
                                  {product.variants.length > 1 ? "A partir de " : ""}
                                  {money.format(minPrice / 100)}
                                </span>
                                <button
                                  type="button"
                                  disabled={!isAvailable}
                                  onClick={() => setSelectedProduct(product)}
                                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                                >
                                  Adicionar
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <h2 className="text-lg font-bold">Carrinho</h2>
            {draft.items.length > 0 && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setDraft((prev) => clearPdvCart(prev));
                  setSubmitError("");
                }}
                className="text-xs font-semibold text-slate-600 underline disabled:opacity-50"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
            {selectedTable ? (
              <>
                <p className="font-bold">
                  {formatTableTab(selectedTable.label, selectedSession?.tab_number)}
                </p>
                <p className="text-xs text-slate-600">
                  {selectedSession
                    ? "Pedido será adicionado à comanda em aberto."
                    : "Uma nova comanda será aberta automaticamente ao enviar."}
                </p>
              </>
            ) : (
              <p className="text-slate-600">Selecione uma mesa ativa para lançar o pedido.</p>
            )}
          </div>

          {draft.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Nenhum item adicionado ao carrinho.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {draft.items.map((item) => (
                <li key={item.id} className="space-y-2 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{item.product_name}</p>
                      <p className="text-xs text-slate-600">{item.variant_name}</p>
                      {item.options.map((opt) => (
                        <p key={opt.option_id} className="text-xs text-slate-600">
                          {opt.quantity}× {opt.name}
                        </p>
                      ))}
                      {item.notes && <p className="mt-1 text-xs text-slate-700">Obs.: {item.notes}</p>}
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {money.format((item.unit_price_cents * item.quantity) / 100)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={submitting}
                        aria-label={`Diminuir quantidade de ${item.product_name}`}
                        onClick={() =>
                          setDraft((prev) => updatePdvItemQuantity(prev, item.id, item.quantity - 1))
                        }
                        className="h-7 w-7 rounded border border-slate-300 text-sm font-bold disabled:opacity-50"
                      >
                        -
                      </button>
                      <span className="min-w-6 text-center text-sm font-semibold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={submitting || item.quantity >= 20}
                        aria-label={`Aumentar quantidade de ${item.product_name}`}
                        onClick={() =>
                          setDraft((prev) => updatePdvItemQuantity(prev, item.id, item.quantity + 1))
                        }
                        className="h-7 w-7 rounded border border-slate-300 text-sm font-bold disabled:opacity-50"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => setDraft((prev) => removePdvItem(prev, item.id))}
                      className="text-xs text-red-700 underline disabled:opacity-50"
                    >
                      Remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">{money.format(totalCents / 100)}</span>
            </div>

            {draft.submissionKey && !submitting && (
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-950">
                Envio pendente de confirmação: a mesma chave de idempotência será preservada na próxima tentativa.
              </p>
            )}

            {submitError && (
              <p role="alert" className="mt-3 text-sm font-medium text-red-700">
                {submitError}
              </p>
            )}

            <button
              type="button"
              disabled={submitting || !menu || !selectedTable || draft.items.length === 0}
              onClick={() => void handleSubmit()}
              className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Enviando..." : "Enviar para cozinha"}
            </button>
          </div>
        </aside>
      </div>

      {selectedProduct && menu && (
        <ProductModal
          product={selectedProduct}
          menu={menu}
          onClose={() => setSelectedProduct(null)}
          onAdd={(item) => {
            setDraft((prev) => addPdvItem(prev, item));
            setSelectedProduct(null);
            setConfirmation("");
            setSubmitError("");
          }}
        />
      )}
    </main>
  );
}
