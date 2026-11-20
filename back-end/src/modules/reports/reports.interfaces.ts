import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import type {
  AlertsQuery,
  ForecastQuery,
  HistoryQuery,
  RangeQuery,
  RebuildInput,
  SummaryQuery,
} from "./reports.schemas.ts";

export interface IReportsService {
  summary(actor: ActorContext, query: SummaryQuery): Promise<unknown>;
  history(actor: ActorContext, query: HistoryQuery): Promise<unknown>;
  products(actor: ActorContext, query: RangeQuery): Promise<unknown>;
  basket(actor: ActorContext, query: RangeQuery): Promise<unknown>;
  heatmap(actor: ActorContext, query: RangeQuery): Promise<unknown>;
  prepTime(actor: ActorContext, query: RangeQuery): Promise<unknown>;
  forecast(actor: ActorContext, query: ForecastQuery): Promise<unknown>;
  alerts(actor: ActorContext, query: AlertsQuery): Promise<unknown>;
  rebuild(actor: ActorContext, input: RebuildInput): Promise<unknown>;
  reconcile(): Promise<void>;
}
