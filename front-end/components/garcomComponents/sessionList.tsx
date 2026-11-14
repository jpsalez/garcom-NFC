'use client'
import { useState } from "react"
import { formatDuration } from "@/lib/format"
import type { ActiveSession } from "@/lib/types"

const WARNING_MS = 15 * 60 * 1000 // aviso do vencimento (DEC-02): o back-end não emite, o balcão calcula

function SessionCard({session, now, onExtend, onClose}: {session: ActiveSession, now: number, onExtend: () => void, onClose: () => void}) {
    const [confirmClose, setConfirmClose] = useState(false)
    const left = Date.parse(session.expires_at) - now
    const ending = left <= WARNING_MS

    return(
        <div className={`w-full border p-5 rounded-lg shadow-lg space-y-3 ${ending ? 'border-amber-500 bg-amber-50' : ''}`}>
            <div className="flex items-center justify-between">
                <p className="text-xl font-bold">{session.table.label}</p>
                <p className={`text-sm tabular-nums ${ending ? 'font-bold text-amber-700' : ''}`}>
                    {left <= 0 ? 'Vencido' : `${ending ? 'Vence em ' : ''}${formatDuration(left)}`}
                </p>
            </div>
            <div className="flex gap-3 text-sm">
                <button onClick={onExtend} aria-label={`Estender ${session.table.label} em 4 horas`} className="flex-1 p-2 border rounded-lg">Estender +4 h</button>
                {confirmClose
                    ? <button onClick={onClose} onBlur={() => setConfirmClose(false)} autoFocus aria-label={`Confirmar encerramento de ${session.table.label}`} className="flex-1 p-2 rounded-lg bg-gray-900 text-white">Confirmar?</button>
                    : <button onClick={() => setConfirmClose(true)} aria-label={`Encerrar ${session.table.label}`} className="flex-1 p-2 border rounded-lg">Encerrar</button>}
            </div>
        </div>
    )
}

export default function SessionList({sessions, now, onExtend, onClose}: {sessions: ActiveSession[], now: number, onExtend: (id: string) => void, onClose: (id: string) => void}) {
    return(
        <div className="w-full p-5 space-y-5">
            <h2 className="text-xl">Mesas em Atendimento</h2>
            {sessions.length === 0 && <p className="text-gray-500">Nenhuma mesa em atendimento.</p>}
            <div className="w-full gap-5 grid grid-cols-1 md:grid-cols-3">
                {sessions.map((s) => (
                    <SessionCard key={s.id} session={s} now={now} onExtend={() => onExtend(s.id)} onClose={() => onClose(s.id)}/>
                ))}
            </div>
        </div>
    )
}
