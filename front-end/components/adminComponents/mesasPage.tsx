'use client'
import { FormEvent, useCallback, useEffect, useState } from "react"
import { useAct } from "@/lib/useAct"
import { useSession } from "@/lib/session"
import type { Table } from "@/lib/types"
import { createTable, listTables, removeTable, updateTable } from "@/services/tables"
import QrModal from "./qrModal"

type Mode = 'view' | 'rename' | 'confirmOff' | 'confirmDelete'

function TableCard({table, onQr, onRename, onActive, onDelete}: {
    table: Table, onQr: () => void, onRename: (label: string) => void, onActive: (active: boolean) => void, onDelete: () => void
}) {
    const [mode, setMode] = useState<Mode>('view')
    const [label, setLabel] = useState(table.label)
    const back = () => setMode('view')

    return(
        <div className={`w-full border p-5 rounded-lg shadow-lg space-y-3 ${table.active ? '' : 'bg-gray-100 text-gray-500'}`}>
            <div className="flex items-center justify-between">
                {mode === 'rename'
                    ? <form onSubmit={(e) => { e.preventDefault(); onRename(label); back() }} className="w-full flex gap-2">
                        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} required autoFocus aria-label="Novo nome da mesa"/>
                        <button type="submit" className="w-auto px-3">Salvar</button>
                        <button type="button" onClick={() => { setLabel(table.label); back() }} className="w-auto px-3">Cancelar</button>
                      </form>
                    : <p className="text-xl font-bold">{table.label}</p>}
                <span className="text-sm">{table.active ? 'Ativa' : 'Inativa'}</span>
            </div>

            {mode === 'confirmOff' && <p className="text-sm">Desativar encerra o atendimento aberto desta mesa.</p>}
            {mode === 'confirmDelete' && <p className="text-sm">Excluir apaga a mesa de vez (só vale sem atendimentos registrados).</p>}

            <div className="flex flex-wrap gap-2 text-sm">
                {mode === 'confirmOff' || mode === 'confirmDelete'
                    ? <>
                        <button onClick={() => { if (mode === 'confirmOff') onActive(false); else onDelete(); back() }} className="flex-1 p-2 rounded-lg bg-gray-900 text-white">Confirmar</button>
                        <button onClick={back} className="flex-1 p-2 border rounded-lg">Cancelar</button>
                      </>
                    : <>
                        <button onClick={onQr} className="flex-1 p-2 border rounded-lg">QR Code</button>
                        <button onClick={() => setMode('rename')} className="flex-1 p-2 border rounded-lg">Renomear</button>
                        {table.active
                            ? <button onClick={() => setMode('confirmOff')} className="flex-1 p-2 border rounded-lg">Desativar</button>
                            : <button onClick={() => onActive(true)} className="flex-1 p-2 border rounded-lg">Ativar</button>}
                        <button onClick={() => setMode('confirmDelete')} className="flex-1 p-2 border rounded-lg">Excluir</button>
                      </>}
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
            <h2 className="text-xl">Mesas</h2>

            <form onSubmit={handleCreate} className="flex gap-3 max-w-md">
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome da mesa (ex.: Mesa 7)" maxLength={60} required aria-label="Nome da nova mesa"/>
                <button type="submit" disabled={busy} className="w-auto px-5">Adicionar</button>
            </form>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            {loaded && tables.length === 0 && <p className="text-gray-500">Nenhuma mesa cadastrada.</p>}

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
