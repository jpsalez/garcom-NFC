import KpiWaiter from "@/components/garcomComponents/kpiWaiter";
import TicketWaiterList from "@/components/garcomComponents/ticketWaiterList";

export default function Admin() {
    return(
        <>
            <div className="w-full flex flex-col">
                <KpiWaiter />
                <TicketWaiterList />
            </div>
        </>
    )
}