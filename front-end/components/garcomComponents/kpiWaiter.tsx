import { NumberTicker } from "../ui/number-ticker"

type Kpis = { pending: number, activeTables: number, bills: number, doneToday: number }

export default function KpiWaiter({ pending, activeTables, bills, doneToday }: Kpis) {

    return(
        <>
            <div
            className="w-full grid  py-10 px-5 
            gap-5 md:gap-10 grid-cols-2 
            md:grid-cols-4
            

            [&>div]:grid [&>div]:grid-rows-2 [&>div]:items-center [&>div]:justify-items-center [&>div]:text-center [&>div]:cursor-pointer
            [&>div]:w-full [&>div]:h-30
            [&>div]:border [&>div]:p-5 [&>div]:rounded-lg [&>div]:shadow-lg
            [&>div]:transition-all [&>div]:duration-300
            [&>div]:hover:scale-105 [&>div]:hover:shadow-xl

            [&>div]:[&>span]:text-3xl
            "
            >
                <div>
                    <NumberTicker value={pending} delay={0}/>
                    <p>Chamados Pendentes</p>
                </div>

                <div>
                    <NumberTicker value={activeTables} delay={0}/>
                    <p>Mesas Ativas</p>
                </div>

                <div>
                    <NumberTicker value={bills} delay={0}/>
                    <p>Pedidos de Contas</p>
                </div>

                <div>
                    <NumberTicker value={doneToday} delay={0}/>
                    <p>Atendimentos Concluídos</p>
                </div>
            </div>
        </>
    )
}
