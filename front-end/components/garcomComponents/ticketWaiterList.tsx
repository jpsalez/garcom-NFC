import type { Call } from "@/lib/types"
import TicketWaiterCard from "./ticketWaiterCard"

export default function TicketWaiterList({calls, now, onFinish}: {calls: Call[], now: number, onFinish: (id: string) => void}) {

    return(
        <>
        <div className="w-full p-5 space-y-5">
            <h2 className="text-xl">Chamados Pendentes</h2>
            {calls.length === 0 && <p className="text-gray-500">Nenhum chamado no momento.</p>}
            <div
            className="
            w-full gap-10
            grid grid-cols-2 md:grid-cols-6
            "
            >
            
                {calls.map( (call) => (
                    <TicketWaiterCard key={call.id} call={call} now={now} onFinish={() => onFinish(call.id)}/>
                ))}
            </div>
        </div>
        </>
    )
}
