'use client'

import { updateRestaurantStatus } from "@/services/admin"
import { useRestaurantModal } from "@/store/restaurantModal"
import { FormEvent, useEffect, useState } from "react"

export default function EditRestaurantModal() {

    const { restaurant, close } = useRestaurantModal()

    const [name, setName] = useState('')
    const [active, setActive] = useState(restaurant?.active || false)

    const [success, setSuccess] = useState('')
    const [showSuccess, setShowSuccess] = useState(false)

    const [error, setError] = useState('')
    const [showError, setShowError] = useState(false)
    
    useEffect( () => {
        function updateRestaurantInfo() {
            setName(restaurant?.name ?? '')
            setActive(restaurant?.active ?? false)
        }
        updateRestaurantInfo()
    }, [restaurant])
    
    async function handleSubmit(e: FormEvent) {
        e.preventDefault()

        if ( (active !== restaurant?.active) && restaurant?.id) {
            
            try {
                await updateRestaurantStatus(restaurant?.id, active)
                setSuccess('Status Atualizado')
                setShowSuccess(true)
            } catch(err) {
                setError('Erro ao atualizar Status')
                setShowError(true)
            }
            
        }
    }
    
    return(
        <>
            <div 
            onClick={() => close()}
            className={`
                fixed top-0 left-0 page-div h-screen bg-black/70
                transition-all duration-300
                ${restaurant ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
            `}>
                
                <div 
                onClick={(e) => e.stopPropagation()}
                className="form-background">
                    
                    <form
                    onSubmit={handleSubmit}
                    className="form-style"
                    action="">

                        <h2>Editar Restaurante</h2>

                        <input type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Nome do Restaurante"
                        required
                        />

                        <select
                            value={active ? 'true' : 'false'}
                            onChange={(e) => setActive(e.target.value === 'true')}
                            className="w-full cursor-pointer rounded-xl border p-5 outline-0"
                        >
                            <option value="true">Ativo</option>
                            <option value="false">Inativo</option>
                        </select>

                        <button>
                            Confirmar
                        </button>

                        <p className={`success ${showSuccess ? 'visible' : ''}`}>
                            {success}
                        </p>

                        <p className={`error ${showError ? 'visible' : ''}`}>
                            {error}
                        </p>

                    </form>

                </div>
                
            </div>
        </>
    )
}