'use client'
import { useState } from "react"
import { formatDuration } from "@/lib/format"
import type { Call } from "@/lib/types"

const TYPE_TEXT = { WAITER: 'Solicitando Atendimento', BILL: 'Solicitando a Conta' }

// now é o relógio já corrigido pelo do servidor; o tempo conta de created_at, que repetir o toque não reinicia (DEC-03)
export default function TicketWaiterCard({call, now, onFinish} : {call: Call, now: number, onFinish: () => void}) {

    const [confirmation, setConfirmation] = useState(false)
    const [busy, setBusy] = useState(false)
    
    return(
        <>
            <div 
            role="button"
            tabIndex={0}
            aria-label={`${call.table.label}: ${TYPE_TEXT[call.type]}. Finalizar chamado`}
            onClick={() => setConfirmation(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setConfirmation(true) } }}
            className="
            relative
            w-full h-full max-h-50 border p-5 rounded-lg shadow-lg cursor-pointer overflow-hidden
            transition-all duration-300
            hover:scale-105 hover:shadow-xl
            ">
                <div inert={!confirmation} className={`
                absolute inset-0 bg-black/50 text-white
                grid grid-rows-3 items-center justify-items-center
                transition-all duration-500
                ${confirmation ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
                `}>
                    <p>Finalizar Chamado?</p>
                    <button disabled={busy} onClick={(e) => { e.stopPropagation(); setBusy(true); onFinish() }}>Sim</button>
                    <button onClick={(e) => { e.stopPropagation(); setConfirmation(false) }}>Não</button>
                </div>
                
                <div inert={confirmation} className={`
                grid grid-rows-2 items-center justify-items-center
                transition-all duration-500
                ${confirmation ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}
                `}>
                    <div className="flex flex-col items-center justify-center">
                        <p className="text-2xl font-bold">{call.table.label}</p>
                        <p className="text-sm tabular-nums">{formatDuration(now - Date.parse(call.created_at))}</p>
                    </div>
                    <p className="text-center">{TYPE_TEXT[call.type]}</p>
                </div>
            </div>
        </>
    )
}
