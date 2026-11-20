'use client'
import { FormEvent, useCallback, useEffect, useRef, useState } from "react"
import { useAct } from "@/lib/useAct"
import type { Table } from "@/lib/types"
import { createTable, listTables, removeTable, updateTable } from "@/services/tables"
import QrModal from "./qrModal"
import { FaCheck, FaPlus, FaSearch, FaTrash } from "react-icons/fa"
import { IoMdCloseCircle } from "react-icons/io"
import { QrCode } from "lucide-react"
import { FaPencil } from "react-icons/fa6"
import { GoDotFill } from "react-icons/go"

type Mode = 'view' | 'rename' | 'confirmOff' | 'confirmDelete' | 'create'

function TableCard({table, onQr, onRename, onActive, onDelete, tableIndex}: {
    table: Table, onQr: () => void, onRename: (label: string) => void, onActive: (active: boolean) => void, onDelete: () => void, tableIndex: number
}) {
    const [mode, setMode] = useState<Mode>('view')
    const [label, setLabel] = useState(table.label)
    const back = () => setMode('view')

    return(

        <div className={`
            kpi-card space-y-0! gap-y-2
            w-full border p-5 md:p-2 rounded-lg shadow-lg
            md:relative
            ${table.active ? '' : 'opacity-70'}
        `}

        >


            {mode === 'rename' && <form onSubmit={(e) => { e.preventDefault(); onRename(label); back() }} className="w-full flex gap-2">
                <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} required autoFocus aria-label="Novo nome da mesa"/>
                <button type="submit" className="w-auto px-3 btn-primary">Salvar</button>
                <button type="button" onClick={() => { setLabel(table.label); back() }} className="w-auto px-3 border rounded-lg">Cancelar</button>
            </form>}

            <div
            className="
                w-full md:aspect-square grid grid-cols-[40px_auto_40px_40px_40px]

                md:grid-rows-[40px_auto_40px] md:grid-cols-4

                [&>div]:flex [&>div]:items-center [&>div]:justify-center

                [&>div>svg]:cursor-pointer [&>div>svg]:text-lg

                [&>div>svg]:transition-all [&>div>svg]:duration-300

                [&>div>svg]:hover:scale-110
            "
            >

                <div className="w-full md:col-span-4 md:flex md:justify-start! md:opacity-80">
                    {table.active
                        ?
                        <button type="button" aria-label="Desativar mesa" onClick={() => setMode('confirmOff')} className="flex w-auto items-center gap-x-1 bg-linear-130 from-white to-psiu-green/40 py-1 px-3 rounded-xl">
                            <GoDotFill className="text-green-700"/> <span className="text-sm font-bold hidden md:block">Ativa</span>
                        </button>
                        :

                        <button type="button" aria-label="Ativar mesa" onClick={() => onActive(true)} className="flex w-auto items-center gap-x-1 bg-linear-130 from-white to-yellow-400/40 py-1 px-3 rounded-xl">
                            <GoDotFill className="text-yellow-700"/> <span className="text-sm hidden md:block">Inativa</span>
                        </button>
                    }
                </div>

                <div className="w-full md:col-span-4 md:flex md:flex-col md:items-start! md:justify-center md:py-3 md:px-1">

                    <p className="hidden md:text-3xl md:font-bold md:flex md:flex-1">{tableIndex < 10 && '0'}{tableIndex}</p>
                    <p className="text-lg font-bold md:font-light text-foreground md:text-sm md:text-gray-600">{table.label}</p>
                </div>

                <div
                onClick={onQr}
                className="md:col-span-2 md:flex md:gap-x-2 md:px-1 md:bg-foreground md:text-background md:rounded-lg cursor-pointer transition-all duration-300 scale-95 hover:scale-100 ">
                    <QrCode /> <span className="hidden md:block text-xs text-center">QR Code</span>
                </div>

                <div>
                    <button type="button" aria-label="Renomear mesa" onClick={() => setMode('rename')} className="w-auto p-0 text-lg hover:scale-110 hover:shadow-none"><FaPencil /></button>
                </div>


                <div>
                    <button type="button" aria-label="Excluir mesa" onClick={() => setMode('confirmDelete')} className="w-auto p-0 text-lg hover:scale-110 hover:shadow-none"><FaTrash /></button>
                </div>
            </div>

            <div inert={mode !== 'confirmOff' && mode !== 'confirmDelete'}
            className={`
                w-full px-5 space-y-3 text-sm overflow-hidden md:bg-white rounded-lg
                md:grid md:grid-rows-2 md:gap-y-1 md:absolute md:inset-0 md:px-3 md:w-full md:max-w-80 md:aspect-square md:items-stretch
                transition-all duration-700 ease-in-out
                ${(mode === 'confirmOff' || mode === 'confirmDelete') ? 'max-h-80 py-2 md:py-5' : 'max-h-0 py-0'}
            `}
            >
                <div className="relative md:h-full md:flex md:items-center md:justify-center md:text-center">
                    <p
                    className={`
                        text-sm
                        transition-opacity duration-300
                        ${mode === 'confirmOff' ? 'opacity-100' : 'opacity-0'}
                    `}
                    >
                        Desativar encerra o atendimento aberto desta mesa.
                    </p>
                    <div
                    className={`
                        text-sm absolute inset-0
                        md:flex md:items-center md:justify-center
                        transition-all duration-300
                        ${mode === 'confirmDelete' ? 'opacity-100' : 'opacity-0'}
                    `}
                    >
                        <p>Excluir apaga a mesa de vez (só vale sem atendimentos registrados).</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2
                md:flex-col md:flex-nowrap md:items-center md:justify-center md:px-3
                ">
                    <button onClick={() => { if (mode === 'confirmOff') onActive(false); else onDelete(); back() }} className="flex-1 p-2 rounded-lg bg-gray-900 text-white">Confirmar</button>
                    <button onClick={back} className="flex-1 p-2 border rounded-lg md:max-w-[70%]">Cancelar</button>
                </div>

            </div>
        </div>
    )
}

export default function MesasPage() {
    const [tables, setTables] = useState<Table[]>([])

    const [viewSelect, setViewSelect] = useState<'all' | 'active' | 'inactive'>('all')
    const [deskSearchOn, setDeskSearchOn] = useState(false)
    const [searchValue, setSearchValue] = useState('')

    const [mobileSearchOn, setMobileSearchOn] = useState(false)
    const mobileSearchRef = useRef<HTMLInputElement>(null)

    const [loaded, setLoaded] = useState(false)
    const [label, setLabel] = useState('')
    const [qr, setQr] = useState<Table | null>(null)

    const [mode, setMode] = useState<Mode>('view')

    const reload = useCallback(async () => {
        try { setTables(await listTables()) } finally { setLoaded(true) }
    }, [])
    const { error, busy, act } = useAct(reload)

    // autofocus search mobile
    useEffect(() => {
        if (mobileSearchOn) {
            const timer = setTimeout(() => {
                mobileSearchRef.current?.focus()
            }, 300)

            return () => clearTimeout(timer)
        }
    }, [mobileSearchOn])

    useEffect(() => { reload().catch(() => {}) }, [reload])

    async function handleCreate(e: FormEvent) {
        e.preventDefault()
        if (await act(() => createTable(label))) {
            setLabel('')
            setMode('view')
        }
    }

    const search = searchValue.trim().toLowerCase()
    const activeCount = tables.filter((table) => table.active).length
    const visibleTables = tables
        .map((table, index) => ({ table, number: index + 1 }))
        .filter(({ table }) => viewSelect === 'all' || table.active === (viewSelect === 'active'))
        .filter(({ table }) => table.label.toLowerCase().includes(search))

    return(
        <div className="page-div flex-col">

            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            {loaded && tables.length === 0 && <p className="text-gray-500">Nenhuma mesa cadastrada.</p>}

            <div className="w-full md:max-w-350 mx-auto flex flex-col gap-5 z-5">

                <div className="relative w-full h-full max-h-35 px-3 rounded-lg overflow-hidden">

                    {/* input add mesa */}
                    <div
                    className={`
                        absolute inset-0 w-full h-full z-10
                        rounded-lg
                        transition-all duration-800
                        ${mode === 'create' ? 'w-full left-0 pointer-events-auto' : 'left-full pointer-events-none'}
                    `}
                    >
                        <form
                        onSubmit={handleCreate}
                        className="h-full flex items-center gap-3 z-10">
                            <input
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="Ex: Mesa 1"
                            maxLength={60}
                            aria-label="Nome da mesa"
                            required
                            />

                            <div
                            role=""
                            className="w-15 bg-foreground text-psiu-green rounded-lg aspect-square flex items-center justify-center text-lg cursor-pointer scale-90
                            transition-all duration-300
                            hover:bg-white hover:text-psiu-green hover:scale-100 hover:border-foreground hover:border
                            ">
                                <button type="submit" disabled={busy} aria-label="Cadastrar mesa" className="flex items-center justify-center">
                                    <FaCheck />
                                </button>
                            </div>

                            <div
                            role="button"
                            onClick={() => setMode('view')}
                            className="w-15 bg-red-500 text-white rounded-lg aspect-square flex items-center justify-center text-lg cursor-pointer scale-90
                            transition-all duration-300
                            hover:bg-white hover:text-red-500 hover:scale-100
                            ">
                                <IoMdCloseCircle />
                            </div>

                        </form>
                    </div>

                    {/* botao add mesa */}
                    <div
                    className={`
                        w-full h-full flex items-center justify-between
                        transition-all duration-500
                        ${mode === 'create' ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}
                    `}
                    >
                        <div>
                            <div className="flex items-center gap-x-2">
                                <h2 className="text-lg md:text-4xl font-extrabold">Mesas Cadastradas</h2>
                                <span className="opacity-70 rounded-xl shadow-lg md:py-1 px-3 md:px-5 bg-gray-300 text-gray-600 border border-gray-500/50 font-bold">{tables.length}</span>
                            </div>

                            <p className="text-sm text-gray-700 font-bold">Gerencie e acompanhe as mesas do seu estabelecimento.</p>
                        </div>

                        <div
                        onClick={() => setMode('create')}
                        className="max-w-10 aspect-square md:max-w-50 md:aspect-auto flex items-center justify-center md:justify-around bg-foreground text-background text-lg md:text-2xl rounded-lg gap-x-2 p-2
                        cursor-pointer
                        transition-all duration-300
                        hover:scale-105
                        ">
                            <FaPlus className="text-sm text-psiu-green"/> <span className="hidden md:text-lg! md:block">Nova Mesa</span>
                        </div>
                    </div>

                </div>

                <div className="relative w-full h-15 flex items-center justify-between px-2 overflow-hidden">

                    <div className={`
                    w-fit flex items-center justify-around gap-x-5 rounded-3xl shadow-lg p-1 bg-gray-200/70 text-gray-600 border border-gray-400/50 font-bold

                    [&>div]:flex [&>div]:items-center [&>div]:justify-center [&>div]:gap-x-1 [&>div]:md:gap-x-2 [&>div]:md:px-5 [&>div]:md:py-1 [&>div]:rounded-3xl [&>div]:cursor-pointer
                    [&>div]:transition-all [&>div]:duration-500

                    [&>div]:[&>p]:pl-1 [&>div]:[&>p]:text-sm

                    [&>div]:[&>span]:text-sm [&>div]:[&>span]:px-3 [&>div]:[&>span]:rounded-3xl
                    [&>div]:[&>span]:transition-all [&>div]:[&>span]:duration-500

                    `}
                    >

                        <div
                        onClick={() => setViewSelect('all')}
                        className={` ${viewSelect === 'all' &&
                            'bg-white! text-foreground [&>span]:bg-psiu-green/70 [&>span]:text-foreground/70'
                            }
                        `}
                        >
                            <p>Todas </p>
                            <span>
                                {tables.length}
                            </span>
                        </div>

                        <div
                        onClick={() => setViewSelect('active')}
                        className={` ${viewSelect === 'active' &&
                            'bg-white! text-foreground [&>span]:bg-psiu-green/70 [&>span]:text-foreground/70'
                            }
                        `}
                        >
                            <p>Ativas </p>
                            <span>
                                {activeCount}
                            </span>
                        </div>

                        <div
                        onClick={() => setViewSelect('inactive')}
                        className={` ${viewSelect === 'inactive' &&
                            'bg-white! text-foreground [&>span]:bg-psiu-green/70 [&>span]:text-foreground/70'
                            }
                        `}
                        >
                            <p>Inativas </p>
                            <span>
                                {tables.length - activeCount}
                            </span>
                        </div>

                    </div>

                    {/* busca mobile */}

                    <div
                    onClick={() => {
                        if (!mobileSearchOn) {
                            setMobileSearchOn(true)
                        } else {
                            setMobileSearchOn(false)
                        }
                    }}
                    className="relative w-fit md:hidden bg-foreground text-background p-2 text-lg rounded-lg">
                        <FaSearch />
                    </div>

                    <div className="w-fit relative *:p-2 hidden md:block">
                        <input type="search" aria-label="Buscar mesa"
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
                            outline-none
                            transition-all duration-300
                            ${deskSearchOn ? 'opacity-100 bg-white' : 'text-opacity-0'}

                            bg-gray-100 border border-gray-300 rounded-3xl caret-foreground/20 px-5! text-foreground/80

                        `}
                        />

                        <span aria-hidden="true"
                        className={`
                            absolute text-gray-600/60 text-sm inset-0 w-full h-full flex items-center p-3 gap-x-3 pointer-events-none
                            transition-all duration-300
                            ${(deskSearchOn || searchValue.length > 0) ? 'opacity-0' : 'opacity-100'}
                        `}>
                            <FaSearch /> <span>Buscar mesa</span>
                        </span>
                    </div>

                    {/* input de busca mobile */}

                    <div
                    className={`
                        md:hidden
                        absolute inset-0
                        origin-right transition-all duration-300
                        ${mobileSearchOn || searchValue.length > 0 ? 'visible pointer-events-auto scale-x-100' : 'invisible scale-x-0 pointer-events-none'}
                    `}
                    >
                        <input type="search" aria-label="Buscar mesa"
                        ref={mobileSearchRef}
                        value={searchValue}
                        onChange={(e) => {
                            setSearchValue(e.target.value)
                            if (e.target.value.length === 0) {
                                setMobileSearchOn(false)
                            }
                        }}
                        onFocus={() => setMobileSearchOn(true)}
                        onBlur={() => {
                            if (searchValue.length === 0) {
                                setMobileSearchOn(false)
                            }
                        }}
                        className={`
                            w-full
                            absolute inset-0 z-10 outline-none
                            transition-all duration-300
                            ${mobileSearchOn ? 'opacity-100 bg-white px-5! border border-gray-300 visible ' : 'text-opacity-0 opacity-0 invisible'}

                            rounded-3xl caret-foreground/20 text-foreground/80
                            focus:bg-white
                        `}
                        />
                    </div>

                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-5 md:max-h-155 no-scrollbar overflow-y-scroll">
                    {loaded && tables.length > 0 && visibleTables.length === 0 && (
                        <p className="text-sm text-gray-500 md:col-span-6">Nenhuma mesa encontrada.</p>
                    )}
                    {visibleTables.map(({ table: t, number }) => (
                        <TableCard key={`${t.id}:${t.label}`} table={t}
                            onQr={() => setQr(t)}
                            onRename={(newLabel) => act(() => updateTable(t.id, { label: newLabel }))}
                            onActive={(active) => act(() => updateTable(t.id, { active }))}
                            onDelete={() => act(() => removeTable(t.id))}
                            tableIndex={number}
                            />
                    ))}
                </div>
            </div>

            {/* Gerar o QR de uma mesa inativa a reativa: recarrega a lista ao fechar */}
            {qr && <QrModal table={qr} onClose={() => { setQr(null); void reload() }}/>}
        </div>
    )
}
