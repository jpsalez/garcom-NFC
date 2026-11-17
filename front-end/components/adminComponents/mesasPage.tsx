'use client'
import { FormEvent, useCallback, useEffect, useState } from "react"
import { useAct } from "@/lib/useAct"
import { useSession } from "@/lib/session"
import type { Table } from "@/lib/types"
import { createTable, listTables, removeTable, updateTable } from "@/services/tables"
import QrModal from "./qrModal"
import { FaCheckCircle, FaChevronCircleUp, FaTrash } from "react-icons/fa"
import { IoIosWarning } from "react-icons/io"
import { QrCode } from "lucide-react"
import { FaCircleCheck, FaPencil } from "react-icons/fa6"
import { CiWarning } from "react-icons/ci"

type Mode = 'view' | 'rename' | 'confirmOff' | 'confirmDelete'

function TableCard({table, onQr, onRename, onActive, onDelete}: {
    table: Table, onQr: () => void, onRename: (label: string) => void, onActive: (active: boolean) => void, onDelete: () => void
}) {
    const [mode, setMode] = useState<Mode>('view')
    const [label, setLabel] = useState(table.label)
    const back = () => setMode('view')

    return(

        <div className={`
            kpi-card
            w-full border p-5 rounded-lg shadow-lg
            ${table.active ? '' : 'bg-gray-100 text-gray-500'}
            transition-all duration-500
            ${(mode === 'confirmOff' || mode === 'confirmDelete') ? 'space-y-3!' : 'space-y-0!'}
        `}
            
        >

            <div>
                {
                    mode === 'rename'
                    ?
                    <>
                        <form onSubmit={(e) => { e.preventDefault(); onRename(label); back() }} className="w-full flex gap-2">
                            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} required autoFocus aria-label="Novo nome da mesa"/>
                            <button type="submit" className="w-auto px-3 btn-primary">Salvar</button>
                            <button type="button" onClick={() => { setLabel(table.label); back() }} className="w-auto px-3 border rounded-lg">Cancelar</button>
                    </form>
                    </>
                    :
                    <>
                        <div
                        className="
                            w-full grid grid-cols-[auto_40px_40px_40px_40px]
                            [&>div]:flex [&>div]:items-center [&>div]:justify-center
                            [&>div>svg]:cursor-pointer [&>div>svg]:text-lg
                            [&>div>svg]:transition-all [&>div>svg]:duration-300
                            [&>div>svg]:hover:scale-110
                        "
                        >
                            <div className="w-full">
                                <p className="text-lg font-bold  w-full">{table.label}</p>
                            </div>

                            <div>
                                {table.active
                                    ?
                                    <FaCircleCheck className="text-green-600" onClick={() => setMode('confirmOff')}/>
                                    :
                                    <IoIosWarning className="text-yellow-600/50" onClick={() => onActive(true)}/>
                                }
                            </div>

                            <div>
                                <QrCode onClick={onQr}/>
                            </div>

                            <div>
                                <FaPencil onClick={() => setMode('rename')}/>
                            </div>


                            <div>
                                <FaTrash onClick={() => setMode('confirmDelete')}/>
                            </div>
                        </div>
                    </>
                }
            </div>

            <div 
            className={`
                px-5 space-y-3 text-sm overflow-hidden
                transition-all duration-500
                ${(mode === 'confirmOff' || mode === 'confirmDelete') ? 'max-h-30 py-2' : 'h-0 py-0'}
            `}
            >
                <div className="relative">
                    <p
                    className={`
                        text-sm
                        transition-all duration-500
                        ${mode === 'confirmOff' ? 'opacity-100' : 'opacity-0'}
                    `}
                    >
                        Desativar encerra o atendimento aberto desta mesa.
                    </p>
                    <p
                    className={`
                        text-sm absolute inset-0
                        transition-all duration-300
                        ${mode === 'confirmDelete' ? 'opacity-100' : 'opacity-0'}
                    `}
                    >
                        Excluir apaga a mesa de vez (só vale sem atendimentos registrados).
                    </p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => { if (mode === 'confirmOff') onActive(false); else onDelete(); back() }} className="flex-1 p-2 rounded-lg bg-gray-900 text-white">Confirmar</button>
                    <button onClick={back} className="flex-1 p-2 border rounded-lg">Cancelar</button>
                </div>

            </div>
        </div>
    )
}

export default function MesasPage() {
    const token = useSession()?.token ?? ''
    const [tables, setTables] = useState<Table[]>([])
    const [loaded, setLoaded] = useState(false)
    const [label, setLabel] = useState('')
    const [qr, setQr] = useState<Table | null>(null)

    const reload = useCallback(async () => {
        try { setTables(await listTables(token)) } finally { setLoaded(true) }
    }, [token])
    const { error, busy, act } = useAct(reload)

    useEffect(() => { reload().catch(() => {}) }, [reload])

    async function handleCreate(e: FormEvent) {
        e.preventDefault()
        if (await act(() => createTable(token, label))) setLabel('')
    }

    return(
        <div className="w-full p-5 space-y-5">

            <div className="w-full flex flex-col space-y-5 items-center justify-center">
                <h2 className="text-xl font-bold">Cadastrar Mesa</h2>
                <form onSubmit={handleCreate} className="w-full flex gap-3 max-w-md border-b border-foreground/30 pb-5">
                    <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome da mesa (ex.: Mesa 7)" maxLength={60} required aria-label="Nome da nova mesa"/>
                    <button type="submit" disabled={busy} className="w-auto px-5 btn-primary">Adicionar</button>
                </form>
                
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            {loaded && tables.length === 0 && <p className="text-gray-500">Nenhuma mesa cadastrada.</p>}

            <h2 className="text-xl">Mesas Cadastradas</h2>
            <div className="w-full gap-5 grid grid-cols-1 md:grid-cols-3">
                {tables.map((t) => (
                    <TableCard key={`${t.id}:${t.label}`} table={t}
                        onQr={() => setQr(t)}
                        onRename={(newLabel) => act(() => updateTable(token, t.id, { label: newLabel }))}
                        onActive={(active) => act(() => updateTable(token, t.id, { active }))}
                        onDelete={() => act(() => removeTable(token, t.id))}/>
                ))}
            </div>

            {/* Gerar o QR de uma mesa inativa a reativa: recarrega a lista ao fechar */}
            {qr && <QrModal token={token} table={qr} onClose={() => { setQr(null); void reload() }}/>}
        </div>
    )
}
