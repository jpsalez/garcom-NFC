import { create } from "zustand";


export type Restaurant = {
    active: boolean;
    created_at: string;
    id: string;
    name: string;
    slug: string;
}

type RestaurantModal = {
    restaurant: Restaurant | null,
    open: (r: Restaurant) => void,
    close: () => void
}

export const useRestaurantModal = create<RestaurantModal>() (
    set => ({
        restaurant: null,
        open: (r: Restaurant) => set({ restaurant: r}),
        close: () => set({ restaurant: null})
    })
)