'use client'
import { FormEvent, useCallback, useEffect, useRef, useState } from "react"
import { useAct } from "@/lib/useAct"
import { useSession } from "@/lib/session"
import { CATEGORIES, type StaffCategory, type StaffUser } from "@/lib/types"
import { createStaff, listStaff, removeStaff, updateStaff } from "@/services/staff"
import { FaCheckCircle, FaPlus, FaRegTrashAlt, FaSearch } from "react-icons/fa"
import { IoIosWarning } from "react-icons/io"
import { GoDotFill } from "react-icons/go"
import { FaPencil } from "react-icons/fa6"

function StaffCard({user, onCategory, onActive, onDelete, rowI}: {
    user: StaffUser, onCategory: (category: StaffCategory | null) => void, onActive: (active: boolean) => void, onDelete: () => void, rowI: number
}) {
    const [confirmDelete, setConfirmDelete] = useState(false)

    let initials = ''
    const names = user.name.split(' ')
    for (const name of names) {
        initials += name[0].toUpperCase()
    }

    
    return(
        // <div className={`w-full border py-3 px-5 rounded-lg shadow-lg space-y-3 ${user.active ? '' : 'border-red-400/50 bg-red-200/30 text-gray-500'}`}>

        //     <div className="w-full grid
        //     grid-cols-[35%_50%_15%] 
        //     md:grid-cols-[20%_25%_5%_15%_auto_auto] gap-3 items-center justify-items-center">

                
        //         <p 
        //         className={`
        //             w-full md:text-center px-3 text-sm font-bold truncate border-r
        //             ${user.active ? '' : 'border-red-400/20'}
        //         `}
        //         >{user.name}</p>
        //         <p 
        //         className={`
        //             w-full text-center px-3 text-sm font-bold truncate border-r
        //             ${user.active ? '' : 'border-red-400/20'}
        //         `}
        //         >{user.email}</p>

        //         <div className="w-full flex items-center justify-center px-3">
        //             {user.active && <FaCheckCircle className="text-green-400"/>}
        //             {!user.active && <IoIosWarning className="text-yellow-400/80"/>}
        //         </div>


        //         <select value={user.category ?? ''} onChange={(e) => onCategory((e.target.value || null) as StaffCategory | null)}
        //         aria-label={`Categoria de ${user.name}`}
        //         className={`
        //         w-full border p-2 rounded-lg text-sm
        //         ${user.active ? '' : 'border-red-400/20'}
        //         `}>
        //             <option value="">Sem categoria</option>
        //             {Object.entries(CATEGORIES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        //         </select>

        //         <div className="w-full flex md:px-5 md:col-span-2 gap-2 text-sm">
        //             <button onClick={() => onActive(!user.active)}
        //             className={`
        //                 flex-1 p-2 border rounded-lg
        //                 ${user.active ? '' : 'border-red-400/20'}
        //             `}
        //             >
        //                 {user.active ? 'Desativar' : 'Ativar'}
        //             </button>

        //             {confirmDelete
        //                 ?
        //                 <button onClick={onDelete} onBlur={() => setConfirmDelete(false)} autoFocus
        //                 className={`
        //                     flex-1 p-2 rounded-lg text-white
        //                     ${user.active ? 'bg-gray-900' : 'bg-red-500/20'}
        //                 `}
        //                 >
        //                     Confirmar?
        //                 </button>
        //                 :
        //                 <button onClick={() => setConfirmDelete(true)}
        //                 className={`
        //                     flex-1 p-2 border rounded-lg
        //                     ${user.active ? '' : 'border-red-400/20'}
        //                 `}
        //                 >
        //                     Excluir
        //                 </button>}
        //         </div>

        //     </div>
        // </div>

        <tr className={`
            [&>td]:p-5
            ${rowI % 2 !== 0 && 'bg-gray-100/70'}
            ${!user.active && 'opacity-50'}
        `}>
            {/* user info */}
            <td className="flex items-center gap-x-3">

                <div className={`
                    w-10 aspect-square flex items-center justify-center rounded-xl
                    ${user.active ? 'bg-foreground text-background' : 'bg-gray-300 text-gray-600'}
                `}>
                    <p className="font-bold">{initials.slice(0, 2)}</p>
                </div>

                <div>
                    <p className="text-lg">{user.name}</p>
                    <p className="text-sm text-gray-600">{user.email}</p>
                </div>
            </td>

            {/* active status */}
            <td className="p-3">
                <div className="flex i-center justify-center">
                    {user.active ?
                    (
                        <div className="w-fit flex items-center justify-center gap-x-1 bg-linear-130 from-white to-psiu-green/40 rounded-xl px-3 py-1">
                            <GoDotFill className="text-psiu-green"/>
                            <span className="text-sm hidden md:block">Ativo</span>
                        </div>
                    )
                    :
                    (
                        <div className="w-fit flex items-center justify-center gap-x-1 bg-linear-130 from-white to-gray-600/40 rounded-xl px-3 py-1">
                            <GoDotFill className="text-gray-600"/>
                            <span className="text-sm hidden md:block">Inativo</span>
                        </div>
                    )
                    }
                </div>
            </td>

            <td className="p-3">
                <select 
                value={user.category ?? ''} 
                onChange={(e) => onCategory((e.target.value || null) as StaffCategory | null)}
                aria-label={`Categoria de ${user.name}`}
                className={`
                w-full border p-2 rounded-lg text-sm
                bg-gray-100 border-gray-300
                
                `}>
                    <option value="">Sem categoria</option>
                    {Object.entries(CATEGORIES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                </select>
            </td>

            <td className="p-3">
                <div className="flex items-center justify-between gap-x-3">
                    <button
                    onClick={() => onActive(!user.active)}
                    className={`
                        border py-2 rounded-xl
                        ${user.active ? '' : 'bg-foreground text-background'}
                    `}
                    >
                        {user.active ? 'Desativar' : 'Ativar'}
                    </button>

                    <div className="w-15 aspect-square flex items-center justify-center border border-gray-300 rounded-xl cursor-pointer
                    text-gray-600
                    transition-all duration-300
                    hover:scale-110 hover:bg-foreground hover:text-background
                    ">
                        <FaRegTrashAlt />
                    </div>
                </div>
            </td>
                    
        </tr>
    )
}

function MobileStaffCard({user, onCategory, onActive, onDelete, rowI}: {
        user: StaffUser, onCategory: (category: StaffCategory | null) => void, onActive: (active: boolean) => void, onDelete: () => void, rowI: number
    }) {
        const [confirmDelete, setConfirmDelete] = useState(false)

        let initials = ''
        const names = user.name.split(' ')
        for (const name of names) {
            initials += name[0].toUpperCase()
        }
    return(
        <div className={`
            w-full grid-rows-2 space-y-1
            py-5
            ${rowI % 2 !== 0 && 'border-y border-foreground/30'}
            ${user.active ? '' : 'opacity-50'}
        `}>

            {/* first row */}
            <div className="w-full grid grid-cols-[1fr_10%] gap-x-1">

                <div>
                    <div className="w-full flex items-center px-2 text-sm truncate line-clamp-1">
                        <p >{user.name}</p>
                    </div>
                    <div className="w-full flex items-center text-xs truncate line-clamp-1 px-2">
                        <p className="">{user.email}</p>
                    </div>
                </div>

                <div className="w-8 aspect-square flex items-center justify-center">
                    {user.active ?
                    (
                        <div className="w-fit flex items-center justify-center gap-x-1 bg-linear-130 from-white to-psiu-green/40 rounded-full p-1">
                            <GoDotFill className="text-psiu-green"/>
                        </div>
                    )
                    :
                    (
                        <div className="w-fit flex items-center justify-center gap-x-1 bg-linear-130 from-white to-gray-600/40 rounded-full p-1">
                            <GoDotFill className="text-gray-600"/>
                        </div>
                    )
                    }
                </div>

            </div>
                
            {/* second row */}
            <div className="w-full grid grid-cols-[80%_1fr_10%_10%] gap-x-1">

                <div className="w-full flex items-center justify-center px-2">
                    <select className="w-full border border-foreground rounded-lg px-2 py-1 text-sm">
                        <option value="">Sem categoria</option>
                        {Object.entries(CATEGORIES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                    </select>
                </div>
                
                <div></div>
            
                <div className="w-8 aspect-square flex items-center justify-center text-lg rounded-lg shadow-lg border border-foreground">
                    <FaPencil />
                </div>

                <div className="w-8 aspect-square flex items-center justify-center text-lg rounded-lg shadow-lg border border-foreground">
                    <FaRegTrashAlt />
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

    const [viewSelect, setViewSelect] = useState('all')
    const [deskSearchOn, setDeskSearchOn] = useState(false)
    const [searchValue, setSearchValue] = useState('')

    const [mobileSearchOn, setMobileSearchOn] = useState(false)
    const mobileSearchRef = useRef<HTMLInputElement>(null)

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
        <div className="page-div p-2!">

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

                    <div className="grid grid-cols-[1fr_auto]  gap-y-3 items-center">

                        <div className="flex-1 col-span-2 md:col-span-1">
                            <div className="flex items-center gap-x-2">
                                <h2 className="text-3xl font-extrabold">Funcionários Cadastrados</h2>
                                <span className="bg-gray-200/50 text-gray-600 py-1 px-3 rounded-xl shadow-lg border border-gray-300/50">{staff.length}</span>
                            </div>
                            <p className="text-gray-600 text-sm">Defina a função de cada fucionário e gerencie seu acesso.</p>
                        </div>
                        
                        <div
                        className="
                        row-start-2 col-start-2 md:row-auto md:col-auto
                        w-fit max-w-50 flex items-center justify-center gap-x-2 bg-foreground text-background! p-3 rounded-xl shadow-lg cursor-pointer
                        transition-all duration-300
                        hover:scale-110
                        ">
                            <FaPlus className="text-psiu-green"/>
                            <span className="hidden md:block">Novo Funcionário</span>
                        </div>

                        <div className="w-fit relative *:p-2">
                            <input type="search" name="" id="" 
                            value={searchValue}
                            onChange={(e) => {
                                setSearchValue(e.target.value)
                            }}
                            onFocus={() => setDeskSearchOn(true)}
                            onBlur={() => {
                                if (searchValue.length === 0) {
                                    setDeskSearchOn(false)
                                }
                            }}
                            className={`
                                w-full md:min-w-100 outline-none
                                transition-all duration-300
                                ${deskSearchOn ? 'opacity-100 bg-white' : 'text-opacity-0'}
                                
                                bg-gray-100 border border-gray-300 rounded-3xl caret-foreground/20 px-5! text-foreground/80
                                
                            `}
                            />
    
                            <label htmlFor="" 
                            className={`
                                absolute text-gray-600/60 text-sm inset-0 w-full h-full flex items-center p-3 gap-x-3 pointer-events-none
                                transition-all duration-300
                                ${(deskSearchOn || searchValue.length > 0) ? 'opacity-0' : 'opacity-100'}
                            `}>
                                <FaSearch /> <span>Buscar por nome ou e-mail</span>
                            </label>
                        </div>

                    </div>
                    
                    {/* <div className="w-full md:max-w-300 gap-5 grid grid-cols-1">

                        {staff.map((u) => (
                            <StaffCard key={u.id} user={u}
                                onCategory={(category) => act(() => updateStaff(token, u.id, { category }))}
                                onActive={(active) => act(() => updateStaff(token, u.id, { active }))}
                                onDelete={() => act(() => removeStaff(token, u.id))}/>
                        ))}
                        
                    </div> */}

                    {/* table desktop */}
                    <div className="hidden md:block">
                        <table className="w-full table-fixed rounded-xl overflow-hidden">
                            <thead>
                                <tr className="bg-gray-200">
                                    <th className="md:w-1/2 p-3 text-left">Funcionário</th>
                                    <th className="p-3 text-center whitespace-nowrap">Status</th>
                                    <th className="p-3 text-center whitespace-nowrap">Função</th>
                                    <th className="p-3 text-center whitespace-nowrap">Ações</th>
                                </tr>
                            </thead>

                            <tbody className="">
                                {staff.map((employee, i) => (
                                    <StaffCard
                                        key={employee.id}
                                        user={employee} rowI={i}
                                        onCategory={(category) => act(() => updateStaff(token, employee.id, { category }))}
                                        onActive={(active) => act(() => updateStaff(token, employee.id, { active }))}
                                        onDelete={() => act(() => removeStaff(token, employee.id))}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* table mobile */}
                    <div className="md:hidden space-y-2">
                        {staff.map((employee, i) => (
                            <MobileStaffCard
                                key={employee.id}
                                user={employee} rowI={i}
                                onCategory={(category) => act(() => updateStaff(token, employee.id, { category }))}
                                onActive={(active) => act(() => updateStaff(token, employee.id, { active }))}
                                onDelete={() => act(() => removeStaff(token, employee.id))}
                            />
                        ))}
                    </div>

                    {loaded && staff.length === 0 && <p className="text-gray-500 text-center">Nenhum funcionário cadastrado.</p>}
                </div>
            </div>

        </div>
    )
}
