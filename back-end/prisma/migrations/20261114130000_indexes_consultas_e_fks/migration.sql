-- Índices das consultas reais e das chaves estrangeiras (conferência de FK ao excluir, listagens do balcão).
-- Os índices parciais table_sessions_one_active e calls_one_open_per_type continuam como estão.
CREATE INDEX "tables_restaurant_id_idx" ON "tables"("restaurant_id");
CREATE INDEX "table_sessions_restaurant_id_status_idx" ON "table_sessions"("restaurant_id", "status");
CREATE INDEX "table_sessions_table_id_idx" ON "table_sessions"("table_id");
CREATE INDEX "session_tokens_session_id_idx" ON "session_tokens"("session_id");
CREATE INDEX "calls_token_id_idx" ON "calls"("token_id");
