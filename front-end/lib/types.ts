export type CallType = "WAITER" | "BILL";

// Chamado como a API devolve (GET /calls e evento call:created)
export type Call = {
  id: string;
  session_id: string;
  type: CallType;
  status: "OPEN" | "DONE" | "CANCELLED";
  created_at: string;
  done_at: string | null;
  table: { label: string };
};

// Atendimento ativo (GET /sessions e evento session:opened)
export type ActiveSession = {
  id: string;
  table: { id: string; label: string };
  expires_at: string;
  tab_number?: number;
};

export type Table = {
  id: string;
  label: string;
  public_code: string;
  public_url: string;
  active: boolean;
};

export type StaffCategory = "WAITER" | "MANAGER" | "CLEANING" | "KITCHEN" | "OTHER";

export const CATEGORIES: Record<StaffCategory, string> = { WAITER: "Garçom", MANAGER: "Gerente", CLEANING: "Limpeza", KITCHEN: "Cozinha", OTHER: "Outro" };

export type StaffUser = {
  id: string;
  name: string;
  email: string;
  category: StaffCategory | null;
  active: boolean;
};

// Telas do SUPER_ADMIN (GET /admin/restaurants e /admin/restaurants/:id/users)
export type Restaurant = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  created_at: string;
};

export type RestaurantUser = StaffUser & { role: "OWNER" | "STAFF" };
