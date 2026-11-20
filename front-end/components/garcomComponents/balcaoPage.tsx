'use client'
import { useState } from "react"
import { useAct } from "@/lib/useAct"
import { useBalcao } from "@/lib/useBalcao"
import { finishCall } from "@/services/calls"
import { closeSession, extendSession } from "@/services/sessions"
import KpiWaiter from "./kpiWaiter"
import SessionList from "./sessionList"
import TicketWaiterList from "./ticketWaiterList"
import { FaBell, FaBellSlash } from "react-icons/fa"
import { useOrderQueue } from "@/hooks/useOrderQueue"
import { useOrderSounds } from "@/hooks/useOrderSounds"
import { unlockAlert } from "@/lib/sound"
import { useSession, type User } from "@/lib/session"
import BalcaoOrders from "./balcaoOrders"

const ORDER_NOTICE_DURATION_MS = 12_000;

function canServeOrders(user: User) {
    return user.role === "OWNER" ||
        (user.role === "STAFF" && (user.category === "MANAGER" || user.category === "WAITER"))
}

// Tela do balcão: dados reais da API, atualizados em tempo real. Só renderiza com sessão (dentro do RequireAuth).
export default function BalcaoPage() {
    const [soundOn, setSoundOn] = useState(true)
    const user = useSession()?.user
    const canServe = !!user && canServeOrders(user)
    const { calls, sessions, doneToday, live, stale, now, reload } = useBalcao(soundOn)
    const { error, act } = useAct(reload)
    const queue = useOrderQueue(canServeOrders, { enabled: canServe, includeClosed: true })
    useOrderSounds(queue, now, soundOn)
    const ready = queue.snapshot?.items.filter(({ progress }) => progress.ready > 0).sort((a, b) =>
        Date.parse(a.ready_since ?? a.created_at) - Date.parse(b.ready_since ?? b.created_at) ||
        Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id)
    ) ?? []
    const notices = queue.alerts && now - Date.parse(queue.alerts.at) < ORDER_NOTICE_DURATION_MS
        ? queue.alerts.entries : []

    return(
        <div className="w-full py-10 md:max-w-300 mx-auto gap-y-10 flex flex-col">

            <div className="w-full  flex items-center justify-between">

                <div className="">
                    <h2 className="text-4xl font-bold">Chamados</h2>
                    <p className="text-sm text-gray-600">Marque o chamado como atendido e finalize quando a mesa for liberada.</p>
                    <span role="status" className="flex items-center gap-2 text-sm">
                        {(!live || stale) && <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />}
                        {stale ? 'Dados desatualizados, tentando de novo...' : live ? '' : 'Reconectando...'}
                    </span>
                </div>

                <button type="button" aria-label="Avisos sonoros" aria-pressed={soundOn} onClick={() => { if (!soundOn) unlockAlert(); setSoundOn(!soundOn) }} className="w-auto p-0 underline cursor-pointer">
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
            {canServe && <div role="status" className={notices.length ? "mx-5 mt-3 space-y-1 rounded-lg border p-3 text-sm" : ""}>
                {notices.map(({ kind, orderId, table }) => (
                    <p key={`${kind}/${orderId}`} className="font-semibold">
                        {kind === "order-new" ? "Novo pedido" : "Pronto para servir"} · {table}
                    </p>
                ))}
            </div>}

            <KpiWaiter
                pending={calls.length}
                activeTables={sessions.length}
                bills={calls.filter((c) => c.type === 'BILL').length}
                doneToday={doneToday}
                ready={canServe ? ready.length : undefined}
            />

            <TicketWaiterList calls={calls} now={now} onFinish={(id) => act(() => finishCall(id))}/>

            {canServe && <BalcaoOrders queue={queue} ready={ready} now={now} />}

            <SessionList
                sessions={sessions}
                now={now}
                onExtend={(id) => act(() => extendSession(id))}
                onClose={(id) => act(() => closeSession(id))}
            />
        </div>
    )
}
