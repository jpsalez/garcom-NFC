'use client'
import { FormEvent, useCallback, useEffect, useState } from "react"
import { useAct } from "@/lib/useAct"
import type { Restaurant } from "@/lib/types"
import { createRestaurant, listRestaurants, setRestaurantActive } from "@/services/admin"
import RestaurantUsers from "./restaurantUsers"

function RestaurantCard({ restaurant, onActive }: { restaurant: Restaurant, onActive: (active: boolean) => void }) {
    const [showUsers, setShowUsers] = useState(false)
    const [confirmOff, setConfirmOff] = useState(false)

    return(
        <div className={`w-full border p-5 rounded-lg shadow-lg space-y-3 ${restaurant.active ? '' : 'text-gray-400'}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xl font-bold truncate">{restaurant.name}</p>
                    <p className="text-sm truncate">{restaurant.slug} · criado em {new Date(restaurant.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <span className="text-sm">{restaurant.active ? 'Ativo' : 'Inativo'}</span>
            </div>
            <div className="flex gap-2 text-sm">
                <button onClick={() => setShowUsers(!showUsers)} className="flex-1 p-2 border rounded-lg">{showUsers ? 'Ocultar usuários' : 'Usuários'}</button>
                {!restaurant.active
                    ? <button onClick={() => onActive(true)} className="flex-1 p-2 border rounded-lg">Ativar</button>
                    : confirmOff
                        ? <button onClick={() => { setConfirmOff(false); onActive(false) }} onBlur={() => setConfirmOff(false)} autoFocus
                            className="flex-1 p-2 rounded-lg bg-gray-900 text-white">Encerra os atendimentos. Confirmar?</button>
                        : <button onClick={() => setConfirmOff(true)} className="flex-1 p-2 border rounded-lg">Desativar</button>}
            </div>
            {showUsers && <RestaurantUsers restaurantId={restaurant.id} />}
        </div>
    )
}

export default function RestaurantsPage() {
    const [restaurants, setRestaurants] = useState<Restaurant[]>([])
    const [loaded, setLoaded] = useState(false)
    const [form, setForm] = useState({ name: '', slug: '' })

    const reload = useCallback(async () => {
        try { setRestaurants(await listRestaurants()) } finally { setLoaded(true) }
    }, [])
    const { error, busy, act } = useAct(reload)

    useEffect(() => { reload().catch(() => {}) }, [reload])

    async function handleCreate(e: FormEvent) {
        e.preventDefault()
        if (await act(() => createRestaurant(form))) setForm({ name: '', slug: '' })
    }

    return(
        <div className="w-full p-5 space-y-5">
            <h2 className="text-xl">Restaurantes</h2>

            <form onSubmit={handleCreate} className="grid gap-3 max-w-md">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do restaurante" maxLength={100} required autoComplete="off" aria-label="Nome"/>
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="identificador-na-url" maxLength={60}
                pattern="[a-z0-9]+(-[a-z0-9]+)*" title="Letras minúsculas, números e hífen" required autoComplete="off" aria-label="Identificador"/>
                <button type="submit" disabled={busy} className="btn-primary">Criar restaurante</button>
            </form>
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            {loaded && restaurants.length === 0 && <p className="text-gray-400">Nenhum restaurante cadastrado.</p>}

            <div className="w-full gap-5 grid grid-cols-1 md:grid-cols-2">
                {restaurants.map((r) => (
                    <RestaurantCard key={r.id} restaurant={r}
                        onActive={(active) => act(() => setRestaurantActive(r.id, active))}/>
                ))}
            </div>
        </div>
    )
}
