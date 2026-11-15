import EquipePage from "@/components/adminComponents/equipePage";
import RequireAuth from "@/components/requireAuth";

export default function Equipe() {
    return(
        <RequireAuth roles={['OWNER']}>
            <EquipePage />
        </RequireAuth>
    )
}
