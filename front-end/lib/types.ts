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
};

export type Table = {
  id: string;
  label: string;
  public_code: string;
  public_url: string;
  active: boolean;
};

export type StaffCategory = "WAITER" | "MANAGER" | "CLEANING" | "KITCHEN" | "OTHER";

export type StaffUser = {
  id: string;
  name: string;
  email: string;
  category: StaffCategory | null;
  active: boolean;
};
