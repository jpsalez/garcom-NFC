'use client'
import { FormEvent, Fragment, useCallback, useEffect, useState } from "react"
import { FaCheckCircle } from "react-icons/fa"
import { FaPencil, FaUsers } from "react-icons/fa6"
import { IoIosWarning } from "react-icons/io"
import { BorderBeam } from "@/components/ui/border-beam"
import { useAct } from "@/lib/useAct"
import type { Restaurant } from "@/lib/types"
import { createRestaurant, listRestaurants, setRestaurantActive } from "@/services/admin"
import EditRestaurantModal from "./editRestaurantModal"
import RestaurantUsers from "./restaurantUsers"

const ICON = "cursor-pointer transition-all duration-300 hover:scale-105"

export default function RestaurantsPage() {
    const [restaurants, setRestaurants] = useState<Restaurant[]>([])
    const [loaded, setLoaded] = useState(false)
    const [editing, setEditing] = useState<Restaurant | null>(null)
    const [usersOf, setUsersOf] = useState('')
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

    async function handleSave(active: boolean) {
        if (editing && await act(() => setRestaurantActive(editing.id, active))) setEditing(null)
    }

    return(
        <div className="w-full p-5 space-y-5">
            <EditRestaurantModal key={editing?.id} restaurant={editing} busy={busy} error={error} onSave={handleSave} onClose={() => setEditing(null)} />

            <div className="form-background mx-auto">
                <BorderBeam size={200} duration={3} colorFrom="#d4d4d8" colorTo="#71717a"/>

                <form onSubmit={handleCreate} className="form-style">
                    <h2>Novo Restaurante</h2>

                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do restaurante" maxLength={100} required autoComplete="off"/>
                    <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="identificador-na-url" maxLength={60}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*" title="Letras minúsculas, números e hífen" required autoComplete="off"/>

                    <button disabled={busy} className="btn-primary">Criar</button>
                </form>
            </div>

            {!editing && error && <p role="alert" className="text-center text-red-500">{error}</p>}
            {loaded && restaurants.length === 0 && <p className="text-center text-gray-400">Nenhum restaurante cadastrado.</p>}

            <table className="w-full table-fixed border-collapse overflow-hidden rounded-xl">
                <thead className="bg-gray-100">
                    <tr>
                        <th className="w-30 p-5 border-r border-gray-200">Status</th>
                        <th className="p-5 border-r border-gray-200 text-left">Nome</th>
                        <th className="w-30 p-5">Ações</th>
                    </tr>
                </thead>

                <tbody>
                    {restaurants.map((r, i) => (
                        <Fragment key={r.id}>
                            <tr className={i % 2 !== 0 ? 'bg-gray-50' : ''}>
                                <td className="p-5 border-r border-gray-200">
                                    <div className="flex justify-center">
                                        {r.active
                                            ? <FaCheckCircle className="text-green-600" size={20} aria-label="Ativo"/>
                                            : <IoIosWarning className="text-red-600" size={20} aria-label="Inativo"/>}
                                    </div>
                                </td>
                                <td className="p-5 border-r border-gray-200 truncate">{r.name}</td>
                                <td className="p-5">
                                    <div className="grid grid-cols-2">
                                        <FaUsers onClick={() => setUsersOf(usersOf === r.id ? '' : r.id)} aria-label="Usuários" className={`mx-auto ${ICON} hover:text-blue-400`}/>
                                        <FaPencil onClick={() => setEditing(r)} aria-label="Editar" className={`mx-auto ${ICON} hover:text-yellow-400`}/>
                                    </div>
                                </td>
                            </tr>
                            {usersOf === r.id && (
                                <tr className="bg-gray-50">
                                    <td colSpan={3} className="p-5"><RestaurantUsers restaurantId={r.id} /></td>
                                </tr>
                            )}
                        </Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
