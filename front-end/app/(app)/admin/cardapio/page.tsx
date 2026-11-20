import CardapioPage from "@/components/adminComponents/cardapioPage";
import RequireAuth from "@/components/requireAuth";

export default function Cardapio() {
  return <RequireAuth roles={['OWNER', 'STAFF']}><CardapioPage /></RequireAuth>;
}
