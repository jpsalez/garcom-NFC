'use client'
import { useState } from "react"
import { useAct } from "@/lib/useAct"
import { useBalcao } from "@/lib/useBalcao"
import { useSession } from "@/lib/session"
import { finishCall } from "@/services/calls"
import { closeSession, extendSession } from "@/services/sessions"
import KpiWaiter from "./kpiWaiter"
import SessionList from "./sessionList"
import TicketWaiterList from "./ticketWaiterList"

// Tela do balcão: dados reais da API, atualizados em tempo real. Só renderiza com sessão (dentro do RequireAuth).
export default function BalcaoPage() {
    const token = useSession()?.token ?? ''
    const [soundOn, setSoundOn] = useState(true)
    const { calls, sessions, doneToday, live, stale, now, reload } = useBalcao(token, soundOn)
    const { error, act } = useAct(reload)

    return(
        <div className="w-full flex flex-col">
            <div className="w-full flex items-center justify-between px-5 pt-5 text-sm">
                <span className="flex items-center gap-2 whitespace-nowrap">
                    <span className={`inline-block w-2 h-2 rounded-full ${live && !stale ? 'bg-green-500' : 'bg-gray-400'}`}/>
                    {stale ? 'Dados desatualizados, tentando de novo...' : live ? 'Ao vivo' : 'Reconectando...'}
                </span>
                <button onClick={() => setSoundOn(!soundOn)} className="w-auto p-0 underline cursor-pointer">
                    Alerta sonoro: {soundOn ? 'ligado' : 'desligado'}
                </button>
            </div>
            {error && <p role="alert" className="px-5 pt-3 text-sm text-red-600">{error}</p>}

            <KpiWaiter
                pending={calls.length}
                activeTables={sessions.length}
                bills={calls.filter((c) => c.type === 'BILL').length}
                doneToday={doneToday}
            />
            <TicketWaiterList calls={calls} now={now} onFinish={(id) => act(() => finishCall(token, id))}/>
            <SessionList
                sessions={sessions}
                now={now}
                onExtend={(id) => act(() => extendSession(token, id))}
                onClose={(id) => act(() => closeSession(token, id))}
            />
        </div>
    )
}
