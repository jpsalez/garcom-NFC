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
import { FaBell, FaBellSlash } from "react-icons/fa"

// Tela do balcão: dados reais da API, atualizados em tempo real. Só renderiza com sessão (dentro do RequireAuth).
export default function BalcaoPage() {
    const token = useSession()?.token ?? ''
    const [soundOn, setSoundOn] = useState(true)
    const { calls, sessions, doneToday, live, stale, now, reload } = useBalcao(token, soundOn)
    const { error, act } = useAct(reload)

    return(
        <div className="w-full py-10 md:max-w-300 mx-auto gap-y-10 flex flex-col">

            <div className="w-full  flex items-center justify-between">
            
                <div className="">
                    <h2 className="text-4xl font-bold">Chamados</h2>
                    <p className="text-sm text-gray-600">Marque o chamado como atendido e finalize quando a mesa for liberada.</p>
                </div>

                <button onClick={() => setSoundOn(!soundOn)} className="w-auto p-0 underline cursor-pointer">
                    {soundOn ?
                    <div className="p-2 border rounded-lg shadow-lg">
                        <FaBell className="text-2xl"/>
                    </div>
                    :
                    <div className="p-2 border border-red-500/60 rounded-lg shadow-lg">
                        <FaBellSlash className="text-2xl text-red-600/60"/>
                    </div>
                    }
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
