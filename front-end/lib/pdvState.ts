import { ApiError } from "@/lib/api";
import type { Order, PosOrderSubmission } from "@/lib/orderTypes";

export { canUsePdv } from "@/lib/kitchenQueue";

export type PdvCartOption = {
  option_id: string;
  name: string;
  quantity: number;
  price_delta_cents: number;
};

export type PdvCartItem = {
  id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  unit_price_cents: number;
  quantity: number;
  notes?: string;
  options: PdvCartOption[];
};

export type PdvDraftState = {
  tableId: string;
  items: PdvCartItem[];
  submissionKey: string | null;
};

export function createPdvDraft(tableId = ""): PdvDraftState {
  return { tableId, items: [], submissionKey: null };
}

export function selectPdvTable(state: PdvDraftState, tableId: string): PdvDraftState {
  if (state.tableId === tableId) return state;
  return { ...state, tableId, submissionKey: null };
}

export function addPdvItem(state: PdvDraftState, item: PdvCartItem): PdvDraftState {
  return { ...state, items: [...state.items, item], submissionKey: null };
}

export function updatePdvItemQuantity(state: PdvDraftState, itemId: string, quantity: number): PdvDraftState {
  const clamped = Math.min(20, Math.floor(quantity));
  if (!Number.isFinite(clamped) || clamped <= 0) {
    return removePdvItem(state, itemId);
  }
  const current = state.items.find((item) => item.id === itemId);
  if (!current || current.quantity === clamped) return state;
  return {
    ...state,
    items: state.items.map((item) => (item.id === itemId ? { ...item, quantity: clamped } : item)),
    submissionKey: null,
  };
}

export function removePdvItem(state: PdvDraftState, itemId: string): PdvDraftState {
  const items = state.items.filter((item) => item.id !== itemId);
  if (items.length === state.items.length) return state;
  return { ...state, items, submissionKey: null };
}

export function clearPdvCart(state: PdvDraftState): PdvDraftState {
  return { ...state, items: [], submissionKey: null };
}

export function pdvCartTotalCents(items: PdvCartItem[]) {
  return items.reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0);
}

export function buildPosOrderSubmission(
  state: PdvDraftState,
  publicationId: string,
  nextKey: () => string = () => crypto.randomUUID(),
): { state: PdvDraftState; payload: PosOrderSubmission } {
  const submissionKey = state.submissionKey ?? nextKey();
  return {
    state: state.submissionKey === submissionKey ? state : { ...state, submissionKey },
    payload: {
      table_id: state.tableId,
      publication_id: publicationId,
      submission_key: submissionKey,
      items: state.items.map((item) => {
        const notes = item.notes?.trim();
        return {
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          selections: item.options.map(({ option_id, quantity }) => ({ option_id, quantity })),
          ...(notes ? { notes } : {}),
        };
      }),
    },
  };
}

export function isUncertainSubmitError(err: unknown) {
  if (!(err instanceof ApiError)) return true;
  return err.status >= 500 || err.status === 429 || err.status === 408;
}

export async function submitPdvDraft(
  state: PdvDraftState,
  publicationId: string,
  send: (payload: PosOrderSubmission) => Promise<{ order: Order; replayed: boolean }>,
  nextKey: () => string = () => crypto.randomUUID(),
): Promise<
  | { ok: true; result: { order: Order; replayed: boolean }; state: PdvDraftState }
  | { ok: false; state: PdvDraftState; uncertain: boolean; error: unknown }
> {
  const prepared = buildPosOrderSubmission(state, publicationId, nextKey);
  try {
    const result = await send(prepared.payload);
    return { ok: true, result, state: clearPdvCart(prepared.state) };
  } catch (error) {
    const uncertain = isUncertainSubmitError(error);
    return {
      ok: false,
      uncertain,
      error,
      // Mantém a mesma submission_key em falhas incertas/rede para retry seguro; regenera em rejeição definitiva (4xx).
      state: uncertain ? prepared.state : { ...prepared.state, submissionKey: null },
    };
  }
}
