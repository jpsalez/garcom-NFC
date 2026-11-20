import RequireAuth from "@/components/requireAuth";
import PedidosPage from "@/components/garcomComponents/pedidosPage";

export default function Pedidos() {
  return <RequireAuth roles={['OWNER', 'STAFF']}><PedidosPage /></RequireAuth>;
}
