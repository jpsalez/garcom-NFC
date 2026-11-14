import KpiWaiter from "@/components/garcomComponents/kpiWaiter";
import TicketWaiterList from "@/components/garcomComponents/ticketWaiterList";
import RequireAuth from "@/components/requireAuth";

export default function Admin() {
    return(
        <RequireAuth roles={['OWNER', 'STAFF']}>
            <div className="w-full flex flex-col">
                <KpiWaiter />
                <TicketWaiterList />
            </div>
        </RequireAuth>
    )
}
