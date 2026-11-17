'use client'
import { FormEvent, useCallback, useEffect, useState } from "react"
import { useAct } from "@/lib/useAct"
import { useSession } from "@/lib/session"
import type { Table } from "@/lib/types"
import { createTable, listTables, removeTable, updateTable } from "@/services/tables"
import QrModal from "./qrModal"
import { FaCheck, FaPlus, FaTrash } from "react-icons/fa"
import { IoIosWarning, IoMdCloseCircle } from "react-icons/io"
import { Plus, QrCode } from "lucide-react"
import { FaCircleCheck, FaPencil } from "react-icons/fa6"
import { IoClose } from "react-icons/io5"
import { MdClose, MdTableBar } from "react-icons/md"

type Mode = 'view' | 'rename' | 'confirmOff' | 'confirmDelete' | 'create'

function TableCard({table, onQr, onRename, onActive, onDelete}: {
    table: Table, onQr: () => void, onRename: (label: string) => void, onActive: (active: boolean) => void, onDelete: () => void
}) {
    const [mode, setMode] = useState<Mode>('view')
    const [label, setLabel] = useState(table.label)
    const back = () => setMode('view')

    return(

        <div className={`
            kpi-card space-y-0! gap-y-2
            w-full border p-5 md:p-2 rounded-lg shadow-lg
            md:relative
            ${table.active ? '' : 'bg-gray-100 text-gray-500'}
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
                            w-full md:aspect-square grid grid-cols-[auto_40px_40px_40px_40px]
                            md:grid-rows-[auto_40px] md:grid-cols-4 
                            [&>div]:flex [&>div]:items-center [&>div]:justify-center
                            [&>div>svg]:cursor-pointer [&>div>svg]:text-lg
                            [&>div>svg]:transition-all [&>div>svg]:duration-300
                            [&>div>svg]:hover:scale-110
                        "
                        >
                            <div className="w-full md:col-span-4 md:flex md:flex-col md:items-center md:justify-center md:py-3">
                                <MdTableBar className="hidden md:flex md:flex-1" size={50}/>
                                <p className="text-2xl font-bold w-full md:text-center">{table.label}</p>
                            </div>

                            <div className="">
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
    const token = useSession()?.token ?? ''
    const [tables, setTables] = useState<Table[]>([])
    const [loaded, setLoaded] = useState(false)
    const [label, setLabel] = useState('')
    const [qr, setQr] = useState<Table | null>(null)

    const [mode, setMode] = useState<Mode>('view')

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
        <div className="page-div">
            
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            {loaded && tables.length === 0 && <p className="text-gray-500">Nenhuma mesa cadastrada.</p>}

            <div className="w-full md:max-w-300 mx-auto flex flex-col gap-5 z-5">

                <div className="relative w-full h-25 rounded-lg overflow-hidden">

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
                            required
                            />

                            <div 
                            role=""
                            className="w-15 bg-green-500 text-white rounded-lg aspect-square flex items-center justify-center text-lg cursor-pointer scale-90
                            transition-all duration-300
                            hover:bg-white hover:text-green-500 hover:scale-100
                            ">
                                <button className="flex items-center justify-center">
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
                        <h2 className="text-2xl">Mesas Cadastradas</h2>
                        <div className="w-10 md:w-12 aspect-square flex items-center justify-center bg-green-500 text-white text-lg md:text-2xl rounded-lg
                        cursor-pointer
                        transition-all duration-300
                        hover:scale-105
                        ">
                            <FaPlus onClick={() => setMode('create')}/>
                        </div>
                    </div>

                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-5 gap-5 md:max-h-155 no-scrollbar overflow-y-scroll">
                    {tables.map((t) => (
                        <TableCard key={`${t.id}:${t.label}`} table={t}
                            onQr={() => setQr(t)}
                            onRename={(newLabel) => act(() => updateTable(token, t.id, { label: newLabel }))}
                            onActive={(active) => act(() => updateTable(token, t.id, { active }))}
                            onDelete={() => act(() => removeTable(token, t.id))}/>
                    ))}
                </div>
            </div>

            {/* Gerar o QR de uma mesa inativa a reativa: recarrega a lista ao fechar */}
            {qr && <QrModal token={token} table={qr} onClose={() => { setQr(null); void reload() }}/>}
        </div>
    )
}
