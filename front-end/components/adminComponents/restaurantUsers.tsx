'use client'
import { FormEvent, useCallback, useEffect, useState } from "react"
import { useAct } from "@/lib/useAct"
import { CATEGORIES, type RestaurantUser, type StaffCategory } from "@/lib/types"
import { createRestaurantUser, listRestaurantUsers, removeRestaurantUser, updateRestaurantUser } from "@/services/admin"

const EMPTY = { name: '', email: '', password: '', role: 'OWNER', category: '' }

function UserRow({ user, onActive, onDelete }: { user: RestaurantUser, onActive: (active: boolean) => void, onDelete: () => void }) {
    const [confirmDelete, setConfirmDelete] = useState(false)

    return(
        <li className={`flex flex-wrap items-center justify-between gap-2 border-t pt-2 ${user.active ? '' : 'text-gray-400'}`}>
            <div className="min-w-0">
                <p className="truncate">{user.name} <span className="text-xs">({user.role === 'OWNER' ? 'Dono' : CATEGORIES[user.category as StaffCategory] ?? 'Funcionário'})</span></p>
                <p className="text-sm truncate">{user.email}</p>
            </div>
            <div className="flex gap-2 text-sm">
                <button onClick={() => onActive(!user.active)} className="w-auto px-3 py-1 border rounded-lg">{user.active ? 'Desativar' : 'Ativar'}</button>
                {confirmDelete
                    ? <button onClick={onDelete} onBlur={() => setConfirmDelete(false)} autoFocus className="w-auto px-3 py-1 rounded-lg bg-gray-900 text-white">Confirmar?</button>
                    : <button onClick={() => setConfirmDelete(true)} className="w-auto px-3 py-1 border rounded-lg">Excluir</button>}
            </div>
        </li>
    )
}

// Usuários de um restaurante (OWNER e STAFF), geridos pelo SUPER_ADMIN
export default function RestaurantUsers({ token, restaurantId }: { token: string, restaurantId: string }) {
    const [users, setUsers] = useState<RestaurantUser[]>([])
    const [form, setForm] = useState(EMPTY)

    const [loaded, setLoaded] = useState(false)

    const reload = useCallback(async () => {
        try { setUsers(await listRestaurantUsers(token, restaurantId)) } finally { setLoaded(true) }
    }, [token, restaurantId])
    const { error, busy, act } = useAct(reload)

    useEffect(() => { reload().catch(() => {}) }, [reload])

    const set = (field: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [field]: e.target.value })

    async function handleCreate(e: FormEvent) {
        e.preventDefault()
        const { category, role, ...rest } = form
        const body = { ...rest, role: role as 'OWNER' | 'STAFF', ...(role === 'STAFF' && category && { category: category as StaffCategory }) }
        if (await act(() => createRestaurantUser(token, restaurantId, body))) setForm(EMPTY)
    }

    return(
        <div className="space-y-3 border-t pt-3">
            {loaded && users.length === 0 && <p className="text-sm text-gray-400">Nenhum usuário cadastrado.</p>}
            <ul className="space-y-2">
                {users.map((u) => (
                    <UserRow key={u.id} user={u}
                        onActive={(active) => act(() => updateRestaurantUser(token, restaurantId, u.id, { active }))}
                        onDelete={() => act(() => removeRestaurantUser(token, restaurantId, u.id))}/>
                ))}
            </ul>

            <form onSubmit={handleCreate} className="grid gap-2">
                <input value={form.name} onChange={set('name')} placeholder="Nome" maxLength={100} required autoComplete="off" aria-label="Nome"/>
                <input type="email" value={form.email} onChange={set('email')} placeholder="E-mail" required autoComplete="off" aria-label="E-mail"/>
                <input type="password" value={form.password} onChange={set('password')} placeholder="Senha (mínimo 8 caracteres)" minLength={8} maxLength={128} required autoComplete="new-password" aria-label="Senha"/>
                <select value={form.role} onChange={set('role')} aria-label="Papel" className="w-full border p-3 rounded-lg">
                    <option value="OWNER">Dono (OWNER)</option>
                    <option value="STAFF">Funcionário (STAFF)</option>
                </select>
                {form.role === 'STAFF' && (
                    <select value={form.category} onChange={set('category')} aria-label="Categoria" className="w-full border p-3 rounded-lg">
                        <option value="">Sem categoria</option>
                        {Object.entries(CATEGORIES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                    </select>
                )}
                <button type="submit" disabled={busy} className="btn-primary">Adicionar usuário</button>
            </form>
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        </div>
    )
}
