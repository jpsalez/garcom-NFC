'use client'
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { type Role, useSession } from "@/lib/session";

// Protege uma tela do balcão: sem login vai ao /login; logado com papel que não serve vai ao balcão.
// Quem precisa do token dentro da tela usa useSession().
export default function RequireAuth({ roles, children }: { roles: Role[]; children: ReactNode }) {
    const router = useRouter()
    const session = useSession()
    const allowed = session && roles.includes(session.user.role)

    useEffect(() => {
        if (session === null) router.replace('/login')
        else if (session && !allowed) router.replace('/admin/waiter') // logado, mas sem permissão para esta tela
    }, [session, allowed, router])

    return allowed ? <>{children}</> : null
}
