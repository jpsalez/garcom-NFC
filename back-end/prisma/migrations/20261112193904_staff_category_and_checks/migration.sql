/*
  Warnings:

  - You are about to drop the column `job_title` on the `users` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "staff_category" AS ENUM ('WAITER', 'MANAGER', 'CLEANING', 'KITCHEN', 'OTHER');

-- AlterTable
ALTER TABLE "users" DROP COLUMN "job_title",
ADD COLUMN     "category" "staff_category";

-- Categoria só existe para STAFF (OWNER e SUPER_ADMIN não têm categoria)
ALTER TABLE "users" ADD CONSTRAINT "users_category_only_staff" CHECK ("category" IS NULL OR "role" = 'STAFF');
