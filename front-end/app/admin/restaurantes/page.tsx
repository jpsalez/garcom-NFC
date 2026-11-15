import RequireAuth from "@/components/requireAuth";
import RestaurantsPage from "@/components/adminComponents/restaurantsPage";

export default function Restaurantes() {
    return(
        <RequireAuth roles={['SUPER_ADMIN']}>
            <RestaurantsPage />
        </RequireAuth>
    )
}
