-- Um chamado aberto por tipo em cada atendimento (DEC-03).
-- Índice parcial feito à mão: o Prisma não o declara no schema, então nunca aceite um migrate dev que o remova.
CREATE UNIQUE INDEX "calls_one_open_per_type" ON "calls"("session_id", "type") WHERE "status" = 'OPEN';
