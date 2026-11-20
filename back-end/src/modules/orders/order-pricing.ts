import { createHash } from "node:crypto";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors/http-errors.ts";
import type { MenuSnapshot } from "../menu/menu.schemas.ts";
import type { Submission } from "./orders.schemas.ts";

export type PricedLine = {
  product_id: string;
  variant_id: string;
  category_id_snapshot: string;
  category_name_snapshot: string;
  product_name_snapshot: string;
  variant_name_snapshot: string;
  quantity: number;
  base_price_cents: number;
  unit_price_cents: number;
  line_total_cents: number;
  notes?: string;
  selections: {
    option_id: string;
    group_name_snapshot: string;
    option_name_snapshot: string;
    selected_quantity: number;
    price_delta_cents: number;
  }[];
};
export function submissionHash(input: Submission, target?: { tab_id?: string; table_id?: string }) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        publication_id: input.publication_id,
        ...(target && { target }),
        items: input.items.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          notes: (item.notes ?? "").replace(/\r\n?/g, "\n").trim(),
          selections: [...item.selections].sort((a, b) => a.option_id.localeCompare(b.option_id)),
        })),
      }),
    )
    .digest("hex");
}
export function priceSubmission(
  content: MenuSnapshot,
  availability: Map<string, boolean>,
  input: Submission,
) {
  const lines: PricedLine[] = input.items.map((item) => {
    const category = content.categories.find((row) =>
      row.products.some((product) => product.id === item.product_id),
    );
    const product = category?.products.find((row) => row.id === item.product_id),
      variant = product?.variants.find((row) => row.id === item.variant_id);
    if (!category || !product || !variant)
      throw new NotFoundError("Produto ou variante não encontrado na publicação");
    const available = (id: string) => {
      if (availability.get(id) !== true) throw new ConflictError("Item indisponível", "ITEM_UNAVAILABLE");
    };
    available(product.id);
    available(variant.id);
    const selections: PricedLine["selections"] = [];
    for (const groupId of variant.group_ids) {
      const group = product.groups.find((row) => row.id === groupId);
      if (!group) throw new ConflictError("Oferta inválida", "INVALID_CATALOG_CONFIGURATION");
      let count = 0;
      for (const choice of item.selections) {
        const option = group.options.find((row) => row.id === choice.option_id);
        if (!option) continue;
        available(option.id);
        if (choice.quantity > option.max_quantity)
          throw new ValidationError(undefined, "Limite do adicional excedido");
        count += choice.quantity;
        selections.push({
          option_id: option.id,
          group_name_snapshot: group.name,
          option_name_snapshot: option.name,
          selected_quantity: choice.quantity,
          price_delta_cents: option.price_delta_cents,
        });
      }
      if (count < group.min_selections || count > group.max_selections)
        throw new ValidationError(undefined, "Quantidade de escolhas fora dos limites do grupo");
    }
    if (selections.length !== item.selections.length)
      throw new NotFoundError("Opção não pertence a esta variante publicada");
    const unit =
      variant.price_cents +
      selections.reduce((sum, choice) => sum + choice.price_delta_cents * choice.selected_quantity, 0);
    if (unit > 10000000) throw new ValidationError(undefined, "Preço unitário excede o limite");
    return {
      product_id: product.id,
      variant_id: variant.id,
      category_id_snapshot: category.id,
      category_name_snapshot: category.name,
      product_name_snapshot: product.name,
      variant_name_snapshot: variant.name,
      quantity: item.quantity,
      base_price_cents: variant.price_cents,
      unit_price_cents: unit,
      line_total_cents: unit * item.quantity,
      notes: item.notes,
      selections,
    };
  });
  const total = lines.reduce((sum, line) => sum + line.line_total_cents, 0);
  if (total > 100000000) throw new ValidationError(undefined, "Total do pedido excede o limite");
  return { lines, total };
}
