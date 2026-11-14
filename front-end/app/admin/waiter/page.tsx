import BalcaoPage from "@/components/garcomComponents/balcaoPage";
import RequireAuth from "@/components/requireAuth";

export default function Admin() {
    return(
        <RequireAuth roles={['OWNER', 'STAFF']}>
            <BalcaoPage />
        </RequireAuth>
    )
}
