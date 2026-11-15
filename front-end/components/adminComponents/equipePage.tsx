'use client'
import { FormEvent, useCallback, useEffect, useState } from "react"
import { useAct } from "@/lib/useAct"
import { useSession } from "@/lib/session"
import type { StaffCategory, StaffUser } from "@/lib/types"
import { createStaff, listStaff, removeStaff, updateStaff } from "@/services/staff"

const CATEGORIES: Record<StaffCategory, string> = { WAITER: 'Garçom', MANAGER: 'Gerente', CLEANING: 'Limpeza', KITCHEN: 'Cozinha', OTHER: 'Outro' }

function StaffCard({user, onCategory, onActive, onDelete}: {
    user: StaffUser, onCategory: (category: StaffCategory | null) => void, onActive: (active: boolean) => void, onDelete: () => void
}) {
    const [confirmDelete, setConfirmDelete] = useState(false)

    return(
        <div className={`w-full border p-5 rounded-lg shadow-lg space-y-3 ${user.active ? '' : 'bg-gray-100 text-gray-500'}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xl font-bold truncate">{user.name}</p>
                    <p className="text-sm truncate">{user.email}</p>
                </div>
                <span className="text-sm">{user.active ? 'Ativo' : 'Inativo'}</span>
            </div>
            <select value={user.category ?? ''} onChange={(e) => onCategory((e.target.value || null) as StaffCategory | null)}
            aria-label={`Categoria de ${user.name}`} className="w-full border p-2 rounded-lg text-sm">
                <option value="">Sem categoria</option>
                {Object.entries(CATEGORIES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
            </select>
            <div className="flex gap-2 text-sm">
                <button onClick={() => onActive(!user.active)} className="flex-1 p-2 border rounded-lg">{user.active ? 'Desativar' : 'Ativar'}</button>
                {confirmDelete
                    ? <button onClick={onDelete} onBlur={() => setConfirmDelete(false)} autoFocus className="flex-1 p-2 rounded-lg bg-gray-900 text-white">Confirmar?</button>
                    : <button onClick={() => setConfirmDelete(true)} className="flex-1 p-2 border rounded-lg">Excluir</button>}
            </div>
        </div>
    )
}

export default function EquipePage() {
    const token = useSession()?.token ?? ''
    const [staff, setStaff] = useState<StaffUser[]>([])
    const [loaded, setLoaded] = useState(false)
    const [form, setForm] = useState({ name: '', email: '', password: '', category: '' })

    const reload = useCallback(async () => {
        try { setStaff(await listStaff(token)) } finally { setLoaded(true) }
    }, [token])
    const { error, busy, act } = useAct(reload)

    useEffect(() => { reload().catch(() => {}) }, [reload])

    const set = (field: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [field]: e.target.value })

    async function handleCreate(e: FormEvent) {
        e.preventDefault()
        const { category, ...rest } = form
        const ok = await act(() => createStaff(token, { ...rest, ...(category && { category: category as StaffCategory }) }))
        if (ok) setForm({ name: '', email: '', password: '', category: '' })
    }

    return(
        <div className="w-full p-5 space-y-5">
            <h2 className="text-xl">Equipe</h2>

            <form onSubmit={handleCreate} className="grid gap-3 max-w-md">
                <input value={form.name} onChange={set('name')} placeholder="Nome" maxLength={100} required autoComplete="off" aria-label="Nome"/>
                <input type="email" value={form.email} onChange={set('email')} placeholder="E-mail" required autoComplete="off" aria-label="E-mail"/>
                <input type="password" value={form.password} onChange={set('password')} placeholder="Senha (mínimo 8 caracteres)" minLength={8} maxLength={128} required autoComplete="new-password" aria-label="Senha"/>
                <select value={form.category} onChange={set('category')} aria-label="Categoria" className="w-full border p-3 rounded-lg">
                    <option value="">Sem categoria</option>
                    {Object.entries(CATEGORIES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                </select>
                <button type="submit" disabled={busy}>Adicionar funcionário</button>
            </form>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            {loaded && staff.length === 0 && <p className="text-gray-500">Nenhum funcionário cadastrado.</p>}

            <div className="w-full gap-5 grid grid-cols-1 md:grid-cols-3">
                {staff.map((u) => (
                    <StaffCard key={u.id} user={u}
                        onCategory={(category) => act(() => updateStaff(token, u.id, { category }))}
                        onActive={(active) => act(() => updateStaff(token, u.id, { active }))}
                        onDelete={() => act(() => removeStaff(token, u.id))}/>
                ))}
            </div>
        </div>
    )
}
