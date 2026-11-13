'use client'
import { useState } from "react"

export default function TicketWaiterCard({table} : {table: number}) {

    const [confirmation, setConfirmation] = useState(false)
    
    async function handleConfirmation() {
        if (!confirmation) {
            setConfirmation(true)
        } else {
            setConfirmation(false)
        }
    }
    
    return(
        <>
            <div 
            role="button"
            tabIndex={0}
            onClick={handleConfirmation}
            className="
            relative
            w-full h-full max-h-50 border p-5 rounded-lg shadow-lg cursor-pointer overflow-hidden
            transition-all duration-300
            hover:scale-105 hover:shadow-xl
            ">
                <div className={`
                absolute inset-0 bg-black/50 text-white
                grid grid-rows-3 items-center justify-items-center
                transition-all duration-500
                ${confirmation ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
                `}>
                    <p>Finalizar Chamado?</p>
                    <button>Sim</button>
                    <button>Não</button>
                </div>
                
                <div className={`
                grid grid-rows-2 items-center justify-items-center
                transition-all duration-500
                ${confirmation ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}
                `}>
                    <div className="flex flex-col items-center justify-center">
                        <p className="font-bold">Mesa</p>
                        <p className="text-2xl font-bold">{table}</p>
                    </div>
                    <p className="text-center">Solicitando Atendimento</p>
                </div>
            </div>
        </>
    )
}