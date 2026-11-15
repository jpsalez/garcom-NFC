import ChangePasswordPage from "@/components/adminComponents/changePasswordPage";
import RequireAuth from "@/components/requireAuth";

export default function Senha() {
    return(
        <RequireAuth roles={['OWNER', 'STAFF']}>
            <ChangePasswordPage />
        </RequireAuth>
    )
}
