'use client'
import { useEffect } from "react";
import { restoreSession } from "@/services/auth";

// Roda uma vez ao abrir o app: pergunta à API quem está logado pelos cookies
export default function SessionBoot() {
    useEffect(() => { void restoreSession() }, [])
    return null
}
