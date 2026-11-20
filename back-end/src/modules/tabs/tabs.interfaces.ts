import type { ActorContext } from "../../shared/authorization/capabilities.ts";
import type {
  CancelTab,
  CloseTab,
  ListTabs,
  MergeTab,
  OpenTab,
  TransferTab,
  UpdateTab,
} from "./tabs.schemas.ts";
import type { tabDetail, tabSummary } from "./tabs-view.ts";

export type TabSummary = ReturnType<typeof tabSummary>;
type TabResult = { tab: TabSummary };

export interface ITabsService {
  open(actor: ActorContext, input: OpenTab): Promise<TabResult>;
  list(
    actor: ActorContext,
    query: ListTabs,
  ): Promise<{ tabs: TabSummary[]; serverTime: Date; nextCursor: string | null }>;
  getDetail(actor: ActorContext, id: string): Promise<{ tab: ReturnType<typeof tabDetail> }>;
  update(actor: ActorContext, id: string, input: UpdateTab): Promise<TabResult>;
  transferTable(actor: ActorContext, id: string, input: TransferTab): Promise<TabResult>;
  preBill(
    actor: ActorContext,
    id: string,
    splitBy?: number,
  ): Promise<{ tab: ReturnType<typeof tabDetail>; equal_split_preview?: number[] }>;
  close(actor: ActorContext, id: string, input: CloseTab): Promise<TabResult & { fiscal_document: null }>;
  cancel(actor: ActorContext, id: string, input: CancelTab): Promise<TabResult>;
  merge(actor: ActorContext, id: string, input: MergeTab): Promise<TabResult>;
}
