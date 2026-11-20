import { z } from "zod";

const uuid = z.uuid();
const digits = (length: number) => z.string().regex(new RegExp(`^[0-9]{${length}}$`));

export const fiscalSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  provider: z.enum(["MOCK", "NOTAAS", "FOCUS_NFE"]),
  environment: z.enum(["HOMOLOGACAO", "PRODUCAO"]),
  cnpj: digits(14),
  // Só escrita: omitido mantém a credencial atual; null a remove.
  credential: z.string().trim().min(8).max(500).nullable().optional(),
  default_tax_profile_id: uuid.nullable().optional(),
});

const profileFields = {
  name: z.string().trim().min(1).max(80),
  ncm: digits(8),
  cfop: digits(4),
  csosn: z.string().regex(/^[0-9]{2,4}$/),
  origin: z.number().int().min(0).max(8).default(0),
  unit: z.string().trim().min(1).max(6).default("UN"),
};
export const taxProfileSchema = z.strictObject(profileFields);
export const updateTaxProfileSchema = z
  .strictObject({
    name: profileFields.name.optional(),
    ncm: profileFields.ncm.optional(),
    cfop: profileFields.cfop.optional(),
    csosn: profileFields.csosn.optional(),
    origin: z.number().int().min(0).max(8).optional(),
    unit: z.string().trim().min(1).max(6).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "Informe a alteração");
export const productTaxProfileSchema = z.strictObject({ tax_profile_id: uuid.nullable() });

// Conferência de uma emissão sem retorno (DEC-20): vincula o invoiceId do provedor ou confirma que nada saiu.
export const retryNfceSchema = z
  .strictObject({
    invoice_id: z.string().trim().min(1).max(128).optional(),
    confirm_not_issued: z.literal(true).optional(),
  })
  .refine((input) => !(input.invoice_id && input.confirm_not_issued), "Escolha só uma opção");
export const cancelNfceSchema = z.strictObject({ reason: z.string().trim().min(15).max(255) });

export type FiscalSettingsInput = z.infer<typeof fiscalSettingsSchema>;
export type TaxProfileInput = z.infer<typeof taxProfileSchema>;
export type UpdateTaxProfileInput = z.infer<typeof updateTaxProfileSchema>;
export type ProductTaxProfileInput = z.infer<typeof productTaxProfileSchema>;
export type RetryNfceInput = z.infer<typeof retryNfceSchema>;
export type CancelNfceInput = z.infer<typeof cancelNfceSchema>;
