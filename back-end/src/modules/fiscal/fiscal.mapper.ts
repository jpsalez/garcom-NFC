import type { payment_method } from "../../../generated/prisma/enums.ts";
import type { NfcePayment } from "./providers/fiscal-provider.interface.ts";

export const tPagByMethod: Record<payment_method, NfcePayment["tPag"]> = {
  CASH: "01",
  CREDIT: "03",
  DEBIT: "04",
  VOUCHER: "10",
  PIX: "17",
  OTHER: "99",
};

// Distribui `total` proporcionalmente aos pesos; o resto do arredondamento vai para o maior peso.
export function allocate(total: number, weights: number[]) {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (!sum) return weights.map(() => 0);
  const shares = weights.map((weight) => Math.floor((total * weight) / sum));
  const largest = weights.indexOf(Math.max(...weights));
  shares[largest] = (shares[largest] ?? 0) + total - shares.reduce((acc, share) => acc + share, 0);
  return shares;
}

// Desconto por item sem passar do valor bruto de nenhum item.
export function discountsFor(grossCents: number[], discountCents: number) {
  const discounts = allocate(discountCents, grossCents);
  let excess = 0;
  discounts.forEach((discount, index) => {
    const cap = grossCents[index] ?? 0;
    if (discount > cap) {
      excess += discount - cap;
      discounts[index] = cap;
    }
  });
  for (let index = 0; excess > 0 && index < discounts.length; index++) {
    const room = (grossCents[index] ?? 0) - (discounts[index] ?? 0);
    const moved = Math.min(room, excess);
    discounts[index] = (discounts[index] ?? 0) + moved;
    excess -= moved;
  }
  return discounts;
}

// Taxa de serviço, couvert e gorjeta ficam fora da nota (DEC-19): os pagamentos são
// rateados até fechar exatamente Σ(vProd − vDesc), sem troco.
export function notePayments<T extends { amountCents: number }>(payments: T[], noteCents: number) {
  const shares = allocate(
    noteCents,
    payments.map(({ amountCents }) => amountCents),
  );
  return payments
    .map((payment, index) => ({ ...payment, amountCents: shares[index] ?? 0 }))
    .filter(({ amountCents }) => amountCents > 0);
}
