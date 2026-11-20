'use client'
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { restoreSession } from "@/services/auth";

// Roda ao abrir o app: pergunta à API quem está logado pelos cookies.
// A mesa e a estação usam credenciais próprias, sem consultar o login da equipe.
export default function SessionBoot() {
    const pathname = usePathname()
    const needsUserSession = !pathname.startsWith('/m/') && pathname !== '/estacao-impressao'

    useEffect(() => { if (needsUserSession) void restoreSession() }, [needsUserSession])
    return null
}
