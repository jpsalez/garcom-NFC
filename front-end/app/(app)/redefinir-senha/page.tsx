import { Suspense } from "react";
import ResetPasswordPage from "@/components/resetPasswordPage";

// useSearchParams precisa de Suspense com cacheComponents ligado
export default function Page() {
    return (
        <Suspense>
            <ResetPasswordPage />
        </Suspense>
    )
}
