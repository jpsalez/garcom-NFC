import TicketWaiterCard from "./ticketWaiterCard"

export default function TicketWaiterList() {

    const tickets = [1, 2, 3, 16, 29, 34]
    
    return(
        <>
        <div className="w-full p-5 space-y-5">
            <h2 className="text-xl">Chamados Pendentes</h2>
            <div
            className="
            w-full gap-10
            grid grid-cols-2 md:grid-cols-6
            "
            >
            
                {tickets.map( (t) => (
                    <TicketWaiterCard key={t} table={t}/>
                ))}
            </div>
        </div>
        </>
    )
}