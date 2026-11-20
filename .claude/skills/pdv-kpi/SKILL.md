---
name: pdv-kpi
description: Cria ou evolui métricas, consultas SQL de histórico (diário/semanal/mensal), agregados e previsões em back-end/src/modules/reports/ respeitando fuso horário e dia operacional. Uso: /pdv-kpi <metrica-ou-endpoint>
---

Workflow para criar ou alterar relatórios, KPIs e previsões do PDV em `back-end/src/modules/reports/`.

## Referência obrigatória
Leia `.claude/knowledge/garcom-nfc/pdv-05-kpis-e-previsoes.md` antes de iniciar.

## Regras invioláveis
1. **Dia operacional obrigatório:** toda agregação e filtro de data usa `business_date` calculado com `restaurants.timezone` + `restaurants.business_day_cutoff_minutes` (nunca `DATE(created_at)` em UTC).
2. **Snapshots imutáveis:** nomes de produto, variante e categoria vêm de `product_name_snapshot`, `variant_name_snapshot` e `category_name_snapshot`, nunca do catálogo vivo.
3. **Tenant e SQL seguro:** `restaurantId` é sempre o 1º parâmetro do repository e `$1` em toda query SQL parametrizada (nunca concatene strings em SQL).
4. **Permissões:** endpoints `/reports/*` exigem `reports:read` (`OWNER` e `MANAGER`).
5. **Previsões honestas:** `forecast.engine.ts` e `anomaly.engine.ts` são funções puras; retorne `INSUFFICIENT_DATA` quando houver `< 3` ocorrências do mesmo dia da semana.

## Passos
1. Verifique se a métrica lê de `daily_sales` / `product_sales_daily` (preferencial) ou se precisa consultar `tabs`/`order_events` com índice adequado.
2. Escreva testes cobrindo fronteira de madrugada (`cutoff = 300`), estorno revertendo delta, consistência com `rebuildRange` e isolamento multi-tenant.
3. Rode `python3 .claude/scripts/verify.py` e `python3 .claude/scripts/check_tenant.py`.
