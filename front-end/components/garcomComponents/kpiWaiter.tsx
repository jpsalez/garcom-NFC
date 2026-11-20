import { MdEmojiPeople } from "react-icons/md"
import { NumberTicker } from "../ui/number-ticker"

type Kpis = { pending: number, activeTables: number, bills: number, doneToday: number, ready?: number }

export default function KpiWaiter({ pending, activeTables, bills, doneToday, ready }: Kpis) {

    return(
        <>
            <div
            className={`w-full grid
            gap-5 md:gap-10 grid-cols-2
            ${ready === undefined ? "md:grid-cols-4" : "md:grid-cols-5"}


            [&>div]:grid [&>div]:grid-rows-2 [&>div]:items-center [&>div]:justify-items-center [&>div]:text-center [&>div]:cursor-pointer
            [&>div]:w-full [&>div]:h-30
            [&>div]:border [&>div]:p-5 [&>div]:rounded-lg [&>div]:shadow-lg
            [&>div]:transition-all [&>div]:duration-300
            [&>div]:hover:scale-105 [&>div]:hover:shadow-xl

            [&>div]:[&>span]:text-4xl
            `}
            >
                <div
                className={`
                    kpi-card
                    ${pending > 0 ? 'bg-linear-130 from-white via-yellow-300/50 to-yellow-600/50' : ''}
                `}
                >
                    <div className="w-full flex items-center justify-between">
                        <p className="text-left text-sm font-bold text-gray-600">Chamados Pendentes</p>
                        <div className={`w-8 aspect-square flex items-center justify-center text-background rounded-lg shadow-lg
                            ${pending ? 'bg-linear-130 from-yellow-600/90 to-yellow-300/90 text-foreground' : 'bg-linear-130 from-[#4a60a3] to-foreground'}
                            `}>
                            <MdEmojiPeople className="text-lg"/>
                        </div>
                    </div>
                    <NumberTicker value={pending} delay={0} className={`text-left w-full font-bold ${pending > 0 ? 'text-foreground' : 'text-gray-600'}`}/>
                </div>

                <div className="kpi-card">
                    <NumberTicker value={activeTables} delay={0}/>
                    <p>Mesas Ativas</p>
                </div>

                <div
                className={`
                    kpi-card
                    ${bills > 0 ? 'bg-red-400/50' : ''}
                `}
                >
                    <NumberTicker value={bills} delay={0}/>
                    <p>Pedidos de Contas</p>
                </div>

                <div className="kpi-card">
                    <NumberTicker value={doneToday} delay={0}/>
                    <p>Atendimentos Concluídos</p>
                </div>

                {ready !== undefined && (
                    <div className={`kpi-card ${ready > 0 ? "border-emerald-600 bg-emerald-100 font-bold" : ""}`}>
                        <NumberTicker value={ready} delay={0}/>
                        <p>Para servir</p>
                    </div>
                )}
            </div>
        </>
    )
}
