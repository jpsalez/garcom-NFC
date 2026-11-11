import { PrismaClient, Prisma } from "../../../generated/prisma/client.ts";

export const prisma = new PrismaClient();

// Permite usar os repositories dentro de prisma.$transaction(async (tx) => ...)
export type DbClient = PrismaClient | Prisma.TransactionClient;
