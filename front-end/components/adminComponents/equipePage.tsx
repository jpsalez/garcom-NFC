'use client'
import { FormEvent, useCallback, useEffect, useState } from "react"
import { useAct } from "@/lib/useAct"
import { useSession } from "@/lib/session"
import { CATEGORIES, type StaffCategory, type StaffUser } from "@/lib/types"
import { createStaff, listStaff, removeStaff, updateStaff } from "@/services/staff"
import { FaCheckCircle } from "react-icons/fa"
import { IoIosWarning } from "react-icons/io"

function StaffCard({user, onCategory, onActive, onDelete}: {
    user: StaffUser, onCategory: (category: StaffCategory | null) => void, onActive: (active: boolean) => void, onDelete: () => void
}) {
    const [confirmDelete, setConfirmDelete] = useState(false)

    return(
        <div className={`w-full border py-3 px-5 rounded-lg shadow-lg space-y-3 ${user.active ? '' : 'border-red-400/50 bg-red-200/30 text-gray-500'}`}>

            <div className="w-full grid
            grid-cols-[35%_50%_15%] 
            md:grid-cols-[20%_25%_5%_15%_auto_auto] gap-3 items-center justify-items-center">

                
                <p 
                className={`
                    w-full md:text-center px-3 text-sm font-bold truncate border-r
                    ${user.active ? '' : 'border-red-400/20'}
                `}
                >{user.name}</p>
                <p 
                className={`
                    w-full text-center px-3 text-sm font-bold truncate border-r
                    ${user.active ? '' : 'border-red-400/20'}
                `}
                >{user.email}</p>

                <div className="w-full flex items-center justify-center px-3">
                    {user.active && <FaCheckCircle className="text-green-400"/>}
                    {!user.active && <IoIosWarning className="text-yellow-400/80"/>}
                </div>


                <select value={user.category ?? ''} onChange={(e) => onCategory((e.target.value || null) as StaffCategory | null)}
                aria-label={`Categoria de ${user.name}`}
                className={`
                w-full border p-2 rounded-lg text-sm
                ${user.active ? '' : 'border-red-400/20'}
                `}>
                    <option value="">Sem categoria</option>
                    {Object.entries(CATEGORIES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                </select>

                <div className="w-full flex md:px-5 md:col-span-2 gap-2 text-sm">
                    <button onClick={() => onActive(!user.active)}
                    className={`
                        flex-1 p-2 border rounded-lg
                        ${user.active ? '' : 'border-red-400/20'}
                    `}
                    >
                        {user.active ? 'Desativar' : 'Ativar'}
                    </button>

                    {confirmDelete
                        ?
                        <button onClick={onDelete} onBlur={() => setConfirmDelete(false)} autoFocus
                        className={`
                            flex-1 p-2 rounded-lg text-white
                            ${user.active ? 'bg-gray-900' : 'bg-red-500/20'}
                        `}
                        >
                            Confirmar?
                        </button>
                        :
                        <button onClick={() => setConfirmDelete(true)}
                        className={`
                            flex-1 p-2 border rounded-lg
                            ${user.active ? '' : 'border-red-400/20'}
                        `}
                        >
                            Excluir
                        </button>}
                </div>

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
        <div className="page-div h-full">

            <div className="w-full md:max-w-300 py-15 grid md:grid-cols-1 gap-y-10 items-start justify-items-center overflow-hidden">

                {/* formulario cadastrar funcionarios */}
                {/* <div className="form-background">

                    <form onSubmit={handleCreate} className="form-style">
                        <h2 className="text-xl">Cadastrar Funcionário</h2>

                        <input value={form.name} onChange={set('name')} placeholder="Nome" maxLength={100} required autoComplete="off" aria-label="Nome"/>

                        <input type="email" value={form.email} onChange={set('email')} placeholder="E-mail" required autoComplete="off" aria-label="E-mail"/>

                        <input type="password" value={form.password} onChange={set('password')} placeholder="Senha (mínimo 8 caracteres)" minLength={8} maxLength={128} required autoComplete="new-password" aria-label="Senha"/>

                        <select value={form.category} onChange={set('category')} aria-label="Categoria" className="w-full border p-3 rounded-lg">
                            <option value="">Sem categoria</option>
                            {Object.entries(CATEGORIES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                        </select>

                        <button className="btn-primary" type="submit" disabled={busy}>Adicionar funcionário</button>

                        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

                    </form>
                </div> */}

                {/* tabela funcionarios */}
                <div className="md:max-h-150! max-w-300! space-y-5 overflow-y-scroll no-scrollbar form-background">

                    <h2 className="text-center text-xl">Funcionários Cadastrados</h2>
                    
                    <div className="w-full md:max-w-300 gap-5 grid grid-cols-1">

                        {staff.map((u) => (
                            <StaffCard key={u.id} user={u}
                                onCategory={(category) => act(() => updateStaff(token, u.id, { category }))}
                                onActive={(active) => act(() => updateStaff(token, u.id, { active }))}
                                onDelete={() => act(() => removeStaff(token, u.id))}/>
                        ))}
                        
                    </div>

                    {loaded && staff.length === 0 && <p className="text-gray-500 text-center">Nenhum funcionário cadastrado.</p>}
                </div>
            </div>

        </div>
    )
}
