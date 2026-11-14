import MesasPage from "@/components/adminComponents/mesasPage";
import RequireAuth from "@/components/requireAuth";

export default function Mesas() {
    return(
        <RequireAuth roles={['OWNER']}>
            <MesasPage />
        </RequireAuth>
    )
}
