-- Abertura e fechamento do atendimento (duração, histórico e relatórios).
-- Aditiva: não toca nos índices parciais. Atendimentos antigos recebem a data da migration em created_at e nulo em closed_at.
ALTER TABLE "table_sessions" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "closed_at" TIMESTAMP(3);
