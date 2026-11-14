'use client'

import { useState } from "react"

export default function MesaPage() {

    const [modal, setModal] = useState(false)

    const [success, setSuccess] = useState(false)
    
    async function handleCallWaiter() {
        setSuccess(true)
    }
    
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
            onClick={(e) => e.stopPropagation()}
            className={`bg-white space-y-3 p-5 z-40 cursor-auto
            w-full m-5 md:max-w-90
            rounded-lg shadow-xl
            `}>
                
                <h2 className="font-bold text-center text-xl">Confirmar o Pedido da Conta?</h2>

                <div className="space-y-3">

                    <button
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
        ${success && 'bg-green-400'}
        `}>
            
            <div className="flex flex-none flex-col items-center justify-center">
                <h3>Mesa</h3>
                <h2 className="text-3xl">X</h2>
            </div>

            <div className="w-full flex-1 flex flex-col items-center justify-center p-5 space-y-5">
                <button 
                onClick={handleCallWaiter}
                disabled={success}
                className="w-full background outline p-3 shadow-lg">
                    {success ? 'O Garçom está a caminho' : 'Chamar Garçom'}
                </button>
            </div>

            <div className="w-full flex-none flex items-center justify-center p-5">
                <button 
                onClick={() => setModal(true)}
                className="w-full bg-gray-900 text-gray-400 outline p-3 shadow-lg">
                    Solicitar a Conta
                </button>
            </div>
        </div>
        </>
    )
}