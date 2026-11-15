'use client'
import { use } from "react";
import MesaPage from "@/components/mesaComponents/mesaPage";

// URL do QR Code / NFC da mesa: <PUBLIC_APP_URL>/m/<código> (DEC-05)
export default function Mesa({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params)
    return <MesaPage code={code} />
}
