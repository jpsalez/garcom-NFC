'use client'
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { restoreSession } from "@/services/auth";

// Roda ao abrir o app: pergunta à API quem está logado pelos cookies.
// A tela do cliente (/m/...) não tem login: não toca em /auth.
export default function SessionBoot() {
    const pathname = usePathname()
    const isCustomerPage = pathname.startsWith('/m/')

    useEffect(() => { if (!isCustomerPage) void restoreSession() }, [isCustomerPage])
    return null
}
