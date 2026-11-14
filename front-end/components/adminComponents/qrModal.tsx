'use client'
import { useEffect, useState } from "react"
import { tableQrCode } from "@/services/tables"
import type { Table } from "@/lib/types"

// QR Code da mesa (SVG gerado pela API) com o link e o download para imprimir
export default function QrModal({token, table, onClose}: {token: string, table: Table, onClose: () => void}) {
    const [svgUrl, setSvgUrl] = useState('')
    const [error, setError] = useState('')
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        let url = ''
        let cancelled = false // o modal pode fechar antes de a resposta chegar
        tableQrCode(token, table.id)
            .then((svg) => {
                if (cancelled) return
                url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
                setSvgUrl(url)
            })
            .catch(() => { if (!cancelled) setError('Não foi possível gerar o QR Code.') })
        return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
    }, [token, table.id])

    async function copy() {
        try {
            await navigator.clipboard.writeText(table.public_url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            setError('Não foi possível copiar o link.')
        }
    }

    return(
        <div onClick={onClose} className="fixed top-0 left-0 z-30 w-full h-screen bg-black/50 flex items-center justify-center cursor-pointer">
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`QR Code da ${table.label}`}
            className="bg-white p-5 m-5 w-full md:max-w-90 rounded-lg shadow-xl space-y-3 cursor-auto flex flex-col items-center">
                <h2 className="font-bold text-xl">{table.label}</h2>
                {/* O SVG vem de um blob local (a API exige o token): next/image não se aplica */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {svgUrl && <img src={svgUrl} alt={`QR Code da ${table.label}`} className="w-64 h-64"/>}
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <p className="text-xs break-all text-center text-gray-600">{table.public_url}</p>
                <div className="w-full flex gap-3 text-sm">
                    <button onClick={copy} className="flex-1 p-2 border rounded-lg">{copied ? 'Link copiado' : 'Copiar link'}</button>
                    {svgUrl && <a href={svgUrl} download={`${table.label}.svg`} className="flex-1 p-2 border rounded-lg text-center">Baixar SVG</a>}
                </div>
                <button onClick={onClose} className="w-full p-2 border rounded-lg text-sm">Fechar</button>
            </div>
        </div>
    )
}
