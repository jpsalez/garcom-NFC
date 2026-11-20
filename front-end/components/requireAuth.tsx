'use client'
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { type Role, type User, useSession } from "@/lib/session";

// Protege uma tela do balcão: sem login vai ao /login; logado com papel que não serve vai ao balcão.
// Quem precisa do token dentro da tela usa useSession().
export default function RequireAuth({ roles, canAccess, children }: {
    roles: Role[]
    canAccess?: (user: User) => boolean
    children: ReactNode
}) {
    const router = useRouter()
    const session = useSession()
    const allowed = session && roles.includes(session.user.role) && (canAccess?.(session.user) ?? true)

    useEffect(() => {
        if (session === null) router.replace('/login')
        else if (session && !allowed) router.replace(session.user.role === 'SUPER_ADMIN' ? '/admin/restaurantes' : '/admin/waiter') // logado, mas sem permissão para esta tela
    }, [session, allowed, router])

    return allowed ? <>{children}</> : null
}
