import { randomBytes } from "node:crypto";

// "Bar do João!" -> "bar-do-joao"
export function slugify(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "restaurante";
}

// Quando o slug já existe, acrescenta um sufixo aleatório
export function withRandomSuffix(slug: string) {
  return `${slug}-${randomBytes(2).toString("hex")}`;
}
