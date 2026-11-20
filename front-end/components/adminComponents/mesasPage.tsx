'use client'
import { FormEvent, useCallback, useEffect, useState } from "react"
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

function TableCard({ table, onQr, onRename, onActive, onDelete, tableIndex }: {
    table: Table
    onQr: () => void
    onRename: (label: string) => void
    onActive: (active: boolean) => void
    onDelete: () => void
    tableIndex: number
}) {
    const [mode, setMode] = useState<Mode>('view')
    const [label, setLabel] = useState(table.label)
    const back = () => setMode('view')

    return (
        <div className={`kpi-card flex min-h-44 w-full flex-col justify-between gap-3 rounded-xl border p-4 shadow-md ${table.active ? '' : 'opacity-70'}`}>
            {mode === 'rename' ? (
                <form
                    onSubmit={(e) => { e.preventDefault(); onRename(label); back() }}
                    className="flex flex-1 flex-col justify-between gap-3"
                >
                    <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-gray-500">Renomear mesa</p>
                        <input
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            maxLength={60}
                            required
                            autoFocus
                            aria-label="Novo nome da mesa"
                            className="p-2! text-sm shadow-none!"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className="btn-primary flex-1 p-2! text-xs font-semibold hover:scale-100">Salvar</button>
                        <button type="button" onClick={() => { setLabel(table.label); back() }} className="flex-1 rounded-lg border p-2! text-xs font-semibold hover:scale-100 hover:shadow-none">Cancelar</button>
                    </div>
                </form>
            ) : (mode === 'confirmOff' || mode === 'confirmDelete') ? (
                <div className="flex flex-1 flex-col justify-between gap-3 text-center">
                    <p className="my-auto text-sm text-gray-700">
                        {mode === 'confirmOff'
                            ? 'Desativar encerra o atendimento aberto desta mesa.'
                            : 'Excluir apaga a mesa de vez (só vale sem atendimentos registrados).'}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => { if (mode === 'confirmOff') onActive(false); else onDelete(); back() }}
                            className="flex-1 rounded-lg bg-gray-900 p-2! text-xs font-semibold text-white hover:scale-100"
                        >
                            Confirmar
                        </button>
                        <button
                            type="button"
                            onClick={back}
                            className="flex-1 rounded-lg border p-2! text-xs font-semibold hover:scale-100 hover:shadow-none"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between gap-2">
                        {table.active ? (
                            <button
                                type="button"
                                aria-label="Desativar mesa"
                                onClick={() => setMode('confirmOff')}
                                className="flex w-auto! items-center gap-x-1 rounded-xl bg-linear-130 from-white to-psiu-green/40 px-3! py-1! text-xs font-bold hover:scale-105 hover:shadow-none"
                            >
                                <GoDotFill className="text-green-700" />
                                <span>Ativa</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                aria-label="Ativar mesa"
                                onClick={() => onActive(true)}
                                className="flex w-auto! items-center gap-x-1 rounded-xl bg-linear-130 from-white to-yellow-400/40 px-3! py-1! text-xs font-semibold hover:scale-105 hover:shadow-none"
                            >
                                <GoDotFill className="text-yellow-700" />
                                <span>Inativa</span>
                            </button>
                        )}
                        <span className="text-2xl font-extrabold tabular-nums text-foreground/85">
                            {tableIndex < 10 ? `0${tableIndex}` : tableIndex}
                        </span>
                    </div>

                    <p className="break-words text-base font-semibold text-foreground">{table.label}</p>

                    <div className="flex items-center gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onQr}
                            className="flex flex-1 items-center justify-center gap-x-2 rounded-lg bg-foreground px-3! py-2! text-xs font-semibold text-background hover:scale-[1.02]"
                        >
                            <QrCode size={16} />
                            <span>QR Code</span>
                        </button>
                        <button
                            type="button"
                            aria-label="Renomear mesa"
                            onClick={() => { setLabel(table.label); setMode('rename') }}
                            className="flex w-auto! shrink-0 items-center justify-center rounded-lg border border-transparent p-2! text-base text-foreground/80 hover:border-gray-200 hover:bg-gray-100 hover:scale-105 hover:shadow-none"
                        >
                            <FaPencil />
                        </button>
                        <button
                            type="button"
                            aria-label="Excluir mesa"
                            onClick={() => setMode('confirmDelete')}
                            className="flex w-auto! shrink-0 items-center justify-center rounded-lg border border-transparent p-2! text-base text-foreground/80 hover:border-red-200 hover:bg-red-50 hover:text-red-600 hover:scale-105 hover:shadow-none"
                        >
                            <FaTrash />
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}

export default function MesasPage() {
    const [tables, setTables] = useState<Table[]>([])
    const [viewSelect, setViewSelect] = useState<'all' | 'active' | 'inactive'>('all')
    const [searchValue, setSearchValue] = useState('')
    const [loaded, setLoaded] = useState(false)
    const [label, setLabel] = useState('')
    const [qr, setQr] = useState<Table | null>(null)
    const [mode, setMode] = useState<Mode>('view')

    const reload = useCallback(async () => {
        try { setTables(await listTables()) } finally { setLoaded(true) }
    }, [])
    const { error, busy, act } = useAct(reload)

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

    const filterPill = (selected: boolean) =>
        `flex w-auto! items-center gap-x-2 rounded-3xl px-3! py-1.5! text-sm font-bold transition-colors hover:scale-100 hover:shadow-none ${
            selected ? 'bg-white text-foreground shadow-sm' : 'bg-transparent text-gray-600 hover:text-foreground'
        }`

    return (
        <div className="w-full p-5">
            <div className="mx-auto flex w-full max-w-350 flex-col gap-5">
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

                {/* Cabeçalho / formulário de nova mesa */}
                <div className="w-full rounded-lg">
                    {mode === 'create' ? (
                        <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                            <input
                                type="text"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                placeholder="Ex: Mesa 1"
                                maxLength={60}
                                aria-label="Nome da mesa"
                                autoFocus
                                required
                                className="min-w-0 flex-1"
                            />
                            <div className="flex shrink-0 items-center gap-2">
                                <button
                                    type="submit"
                                    disabled={busy}
                                    aria-label="Cadastrar mesa"
                                    className="flex h-12 w-12! items-center justify-center rounded-lg bg-foreground p-0! text-lg text-psiu-green hover:border hover:border-foreground hover:bg-white"
                                >
                                    <FaCheck />
                                </button>
                                <button
                                    type="button"
                                    aria-label="Cancelar nova mesa"
                                    onClick={() => { setLabel(''); setMode('view') }}
                                    className="flex h-12 w-12! items-center justify-center rounded-lg bg-red-500 p-0! text-lg text-white hover:border hover:border-red-500 hover:bg-white hover:text-red-500"
                                >
                                    <IoMdCloseCircle />
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-x-2">
                                    <h2 className="text-2xl font-extrabold md:text-4xl">Mesas Cadastradas</h2>
                                    <span className="rounded-xl border border-gray-500/40 bg-gray-200 px-3 py-0.5 text-sm font-bold text-gray-700 md:px-4 md:py-1">
                                        {tables.length}
                                    </span>
                                </div>
                                <p className="mt-1 text-sm font-medium text-gray-600">
                                    Gerencie e acompanhe as mesas do seu estabelecimento.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setMode('create')}
                                className="flex w-auto! shrink-0 items-center gap-x-2 rounded-lg bg-foreground px-4! py-2.5! text-sm font-semibold text-background md:text-base"
                            >
                                <FaPlus className="text-xs text-psiu-green" />
                                <span>Nova Mesa</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Filtros e busca */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex w-fit flex-wrap items-center gap-1 rounded-3xl border border-gray-300/70 bg-gray-200/70 p-1 shadow-sm">
                        <button type="button" onClick={() => setViewSelect('all')} className={filterPill(viewSelect === 'all')}>
                            <span>Todas</span>
                            <span className={`rounded-3xl px-2 py-0.5 text-xs ${viewSelect === 'all' ? 'bg-psiu-green/70 text-foreground' : 'bg-gray-300/60'}`}>
                                {tables.length}
                            </span>
                        </button>
                        <button type="button" onClick={() => setViewSelect('active')} className={filterPill(viewSelect === 'active')}>
                            <span>Ativas</span>
                            <span className={`rounded-3xl px-2 py-0.5 text-xs ${viewSelect === 'active' ? 'bg-psiu-green/70 text-foreground' : 'bg-gray-300/60'}`}>
                                {activeCount}
                            </span>
                        </button>
                        <button type="button" onClick={() => setViewSelect('inactive')} className={filterPill(viewSelect === 'inactive')}>
                            <span>Inativas</span>
                            <span className={`rounded-3xl px-2 py-0.5 text-xs ${viewSelect === 'inactive' ? 'bg-psiu-green/70 text-foreground' : 'bg-gray-300/60'}`}>
                                {tables.length - activeCount}
                            </span>
                        </button>
                    </div>

                    <div className="relative w-full sm:w-64">
                        <FaSearch aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400" />
                        <input
                            type="search"
                            aria-label="Buscar mesa"
                            placeholder="Buscar mesa"
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                            className="w-full rounded-3xl border border-gray-300 bg-gray-100 py-2 pl-9 pr-4 text-sm text-foreground outline-none transition-colors focus:border-foreground/50 focus:bg-white"
                        />
                    </div>
                </div>

                {/* Lista de mesas */}
                {loaded && tables.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhuma mesa cadastrada.</p>
                ) : loaded && visibleTables.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhuma mesa encontrada.</p>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                        {visibleTables.map(({ table: t, number }) => (
                            <TableCard
                                key={`${t.id}:${t.label}`}
                                table={t}
                                onQr={() => setQr(t)}
                                onRename={(newLabel) => act(() => updateTable(t.id, { label: newLabel }))}
                                onActive={(active) => act(() => updateTable(t.id, { active }))}
                                onDelete={() => act(() => removeTable(t.id))}
                                tableIndex={number}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Gerar o QR de uma mesa inativa a reativa: recarrega a lista ao fechar */}
            {qr && <QrModal table={qr} onClose={() => { setQr(null); void reload() }} />}
        </div>
    )
}
