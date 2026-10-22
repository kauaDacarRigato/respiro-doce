import { z } from "zod";
import { decimalInput, priceInCents } from "@/features/products/material-domain";
export const paymentLabels = {
  cash: "Dinheiro",
  pix: "Pix",
  debit: "Débito",
  credit: "Crédito",
} as const;
export const saleFormSchema = z.object({
  recipeId: z.string(),
  productName: z.string(),
  quantity: z.string(),
  price: z.string(),
  payment: z.enum(["cash", "pix", "debit", "credit"]),
  occurredLocal: z.string(),
  anonymous: z.boolean(),
  customerId: z.string(),
  customerName: z.string(),
  customerPhone: z.string(),
  confirmProduct: z.boolean(),
  confirmLoss: z.boolean(),
});
export type SaleForm = z.infer<typeof saleFormSchema>;
export type SaleQuote = {
  signature: string;
  product_name: string;
  historical: boolean;
  unit_cost: string;
  debit_fee_percent: string;
  credit_fee_percent: string;
  applied_fee_percent: string;
  gross_cents: string;
  production_cents: string;
  fee_cents: string;
  total_cost_cents: string;
  net_cents: string;
  profit_cents: string;
};
export type Sale = Omit<SaleQuote, "signature" | "historical"> & {
  id: string;
  recipe_id: string | null;
  recipe_source_id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  quantity: number;
  unit_price_cents: string;
  payment: keyof typeof paymentLabels;
  occurred_at: string;
};
export type Customer = {
  id: string;
  name: string;
  phone: string;
  items: string;
  total_cents: string;
  purchases: string;
  last_purchase: string | null;
};
export function normalizePhone(input: string) {
  const value = input.trim();
  if (!/^\+?[0-9 ().-]+$/.test(value) || value.length > 40)
    throw new Error("Informe telefone com DDD; para outro país, use + e o código do país.");
  let digits = value.replace(/\D/g, "");
  if (!value.startsWith("+")) {
    if ([10, 11].includes(digits.length)) digits = `55${digits}`;
    else if (!(digits.startsWith("55") && [12, 13].includes(digits.length)))
      throw new Error("Informe DDD e telefone ou use + e o código do país.");
  }
  if (
    !/^[1-9]\d{7,14}$/.test(digits) ||
    (digits.startsWith("55") && (![12, 13].includes(digits.length) || digits[2] === "0"))
  )
    throw new Error("Telefone inválido. Confira o DDD e o número.");
  return `+${digits}`;
}
// A entrada representa o relógio de São Paulo, independente do fuso do aparelho.
export function saoPauloInput(instant = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}
export const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
export function emptySaleForm(): SaleForm {
  return {
    recipeId: "",
    productName: "",
    quantity: "1",
    price: "",
    payment: "pix",
    occurredLocal: saoPauloInput(),
    anonymous: true,
    customerId: "",
    customerName: "",
    customerPhone: "",
    confirmProduct: false,
    confirmLoss: false,
  };
}
export function formFromSale(s: Sale): SaleForm {
  return {
    recipeId: s.recipe_source_id,
    productName: s.product_name,
    quantity: String(s.quantity),
    price: `${BigInt(s.unit_price_cents) / 100n},${(BigInt(s.unit_price_cents) % 100n).toString().padStart(2, "0")}`,
    payment: s.payment,
    occurredLocal: saoPauloInput(new Date(s.occurred_at)),
    anonymous: s.customer_id === null,
    customerId: s.customer_id ?? "",
    customerName: s.customer_name ?? "",
    customerPhone: s.customer_phone ?? "",
    confirmProduct: false,
    confirmLoss: false,
  };
}
export function salePayload(form: SaleForm, preview = false) {
  if (
    !saleFormSchema.safeParse(form).success ||
    !z.string().uuid().safeParse(form.recipeId).success
  )
    throw new Error("Escolha o produto da venda.");
  const qty = Number(decimalInput(form.quantity));
  if (!Number.isInteger(qty) || qty < 1 || qty > 1000000)
    throw new Error("A quantidade deve ser um inteiro entre 1 e 1.000.000.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(form.occurredLocal))
    throw new Error("Informe a data e a hora da venda.");
  const name = form.customerName.trim().replace(/\s+/g, " ");
  if (!preview && !form.anonymous && (!name || name.length > 120))
    throw new Error("Informe o nome do cliente com até 120 caracteres.");
  return {
    recipe_id: form.recipeId,
    quantity: qty,
    unit_price_cents: priceInCents(form.price),
    payment: form.payment,
    occurred_local: form.occurredLocal,
    anonymous: form.anonymous,
    customer_id: form.anonymous ? null : form.customerId || null,
    customer_name: form.anonymous ? null : name,
    customer_phone: form.anonymous
      ? null
      : preview
        ? form.customerPhone
        : normalizePhone(form.customerPhone),
    confirm_product_change: form.confirmProduct,
    confirm_loss: form.confirmLoss,
  };
}
export function commerceError(error: { code?: string; message?: string }) {
  if (error.code === "P0003")
    return "Os valores mudaram. Clique em Recalcular, confira o resultado e salve novamente.";
  if (error.code === "P0002")
    return "Venda, cliente ou produto indisponível. Atualize a lista e confira os vínculos.";
  if (error.code === "42501" || error.code === "PGRST301")
    return "Seu acesso expirou. Entre novamente; o rascunho está preservado.";
  if (error.code?.startsWith("22"))
    return error.message?.slice(0, 220) ?? "Confira os dados da venda.";
  if (error.code?.startsWith("23")) return "Confira os dados e as referências da venda.";
  return "Não foi possível confirmar a operação. Confira a conexão e tente novamente com os mesmos dados.";
}
