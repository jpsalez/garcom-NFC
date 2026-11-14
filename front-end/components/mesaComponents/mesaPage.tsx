'use client'

import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError } from "@/lib/api"
import { clearDevice, readDevice, saveDevice, type Device } from "@/lib/device"
import type { CallType } from "@/lib/types"
import { createCall } from "@/services/calls"
import { scanTable } from "@/services/tables"

function openErrorMessage(err: unknown) {
    if (err instanceof ApiError && err.status === 404) return 'Mesa não encontrada ou indisponível. Fale com o garçom.'
    if (err instanceof ApiError && err.status === 429) return err.message
    return 'Não foi possível abrir a mesa. Verifique a conexão e tente novamente.'
}

export default function MesaPage({ code }: { code: string }) {

    const [modal, setModal] = useState(false)
    const [device, setDevice] = useState<Device | null>(null)
    const [fatal, setFatal] = useState('')
    const [attempt, setAttempt] = useState(0)
    const timers = useRef<ReturnType<typeof setTimeout>[]>([])
    const [notice, setNotice] = useState('')
    const [sent, setSent] = useState<Record<CallType, boolean>>({ WAITER: false, BILL: false })

    // Token do aparelho: reaproveita o guardado; sem ele (ou vencido), o scan abre/entra no atendimento da mesa
    const open = useCallback(async () => {
        const saved = readDevice(code)
        if (saved) return saved
        const fresh = await scanTable(code)
        saveDevice(code, fresh)
        return fresh
    }, [code])

    useEffect(() => {
        open().then(setDevice).catch((err) => setFatal(openErrorMessage(err)))
    }, [open, attempt])

    // Timers dos botões não sobrevivem à tela
    useEffect(() => () => timers.current.forEach(clearTimeout), [])

    // O servidor repete o chamado aberto (200) em vez de criar outro, então tocar de novo é seguro
    async function sendCall(type: CallType) {
        if (!device) return
        setNotice('')
        try {
            try {
                await createCall(device.token, type)
            } catch (err) {
                // Atendimento encerrado ou token vencido: novo scan e uma segunda tentativa
                if (!(err instanceof ApiError && err.status === 401)) throw err
                clearDevice(code)
                const fresh = await open()
                setDevice(fresh)
                await createCall(fresh.token, type)
            }
            setSent((current) => ({ ...current, [type]: true }))
            // Depois de um tempo o botão volta: o cliente pode chamar de novo (o cliente não vê quando o garçom atende, DEC-08)
            timers.current.push(setTimeout(() => setSent((current) => ({ ...current, [type]: false })), 30_000))
        } catch (err) {
            setNotice(err instanceof ApiError && err.status === 429 ? err.message : 'Não foi possível enviar. Tente novamente.')
        }
    }

    async function handleConfirmBill() {
        setModal(false)
        await sendCall('BILL')
    }

    if (fatal) return (
        <div className="w-full flex flex-col items-center py-10 px-5 space-y-5">
            <p role="alert" className="text-center">{fatal}</p>
            <button onClick={() => { setFatal(''); setAttempt((n) => n + 1) }} className="w-auto px-5 outline">Tentar de novo</button>
        </div>
    )
    if (!device) return <p className="w-full text-center py-10">Abrindo a mesa...</p>
    const success = sent.WAITER || sent.BILL
    
    return(
        <>

        {/* Modal fechar conta */}
        <div
        onClick={() => setModal(false)}
        className={`
        fixed top-0 left-0 z-30 w-full h-screen bg-black/50 cursor-pointer
        flex items-center justify-center
        transition-all duration-500
        ${modal ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
        >
            <div 
            role="dialog" aria-modal="true" aria-label="Confirmar o pedido da conta"
            onClick={(e) => e.stopPropagation()}
            className={`bg-white space-y-3 p-5 z-40 cursor-auto
            w-full m-5 md:max-w-90
            rounded-lg shadow-xl
            `}>
                
                <h2 className="font-bold text-center text-xl">Confirmar o Pedido da Conta?</h2>

                <div className="space-y-3">

                    <button
                    onClick={handleConfirmBill}
                    className={`
                    bg-green-400
                    `}
                    >
                        Sim
                    </button>
                    
                    <button
                    onClick={() => setModal(false)}
                    className={`bg-red-400`}
                    >
                        Não
                    </button>
                </div>
            </div>
        </div>
        
        
        <div className={`
        w-full max-w-150 mx-auto flex flex-col items-center justify-center py-10
        transition-all duration-700
        ${success ? 'bg-green-400' : ''}
        `}>
            
            <div className="flex flex-none flex-col items-center justify-center">
                <h3>{device.restaurant.name}</h3>
                <h2 className="text-3xl">{device.table.label}</h2>
            </div>

            <div className="w-full flex-1 flex flex-col items-center justify-center p-5 space-y-5">
                <button 
                onClick={() => sendCall('WAITER')}
                disabled={sent.WAITER}
                className="w-full background outline p-3 shadow-lg">
                    {sent.WAITER ? 'O Garçom está a caminho' : 'Chamar Garçom'}
                </button>
            </div>

            {notice && <p role="alert" className="px-5 text-center text-red-700">{notice}</p>}

            <div className="w-full flex-none flex items-center justify-center p-5">
                <button 
                onClick={() => setModal(true)}
                disabled={sent.BILL}
                className="w-full bg-gray-900 text-gray-400 outline p-3 shadow-lg">
                    {sent.BILL ? 'Conta solicitada. O garçom já vai até você' : 'Solicitar a Conta'}
                </button>
            </div>
        </div>
        </>
    )
}