'use client'
import { FormEvent, useState } from "react"
import type { Restaurant } from "@/lib/types"

type Props = {
    restaurant: Restaurant | null
    busy: boolean
    error: string
    onSave: (active: boolean) => void
    onClose: () => void
}

// Só o status é editável: o back-end não renomeia restaurante
export default function EditRestaurantModal({ restaurant, busy, error, onSave, onClose }: Props) {
    const [choice, setChoice] = useState<boolean | null>(null)
    const active = choice ?? restaurant?.active ?? true

    function handleSubmit(e: FormEvent) {
        e.preventDefault()
        if (restaurant && active !== restaurant.active) onSave(active)
        else onClose()
    }

    return(
        <div
        onClick={onClose}
        className={`
            fixed top-0 left-0 page-div h-screen bg-black/70
            transition-all duration-300
            ${restaurant ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}>
            <div onClick={(e) => e.stopPropagation()} className="form-background">
                <form onSubmit={handleSubmit} className="form-style">
                    <h2>Editar Restaurante</h2>

                    <input value={restaurant?.name ?? ''} disabled aria-label="Nome do restaurante"/>

                    <select
                        value={active ? 'true' : 'false'}
                        onChange={(e) => setChoice(e.target.value === 'true')}
                        aria-label="Status"
                        className="w-full cursor-pointer rounded-xl border p-5 outline-0"
                    >
                        <option value="true">Ativo</option>
                        <option value="false">Inativo</option>
                    </select>

                    {restaurant?.active && !active && (
                        <p className="text-sm text-center">Desativar encerra os atendimentos em andamento.</p>
                    )}

                    <button disabled={busy}>Confirmar</button>

                    <p role="alert" className={`error ${error ? 'visible' : ''}`}>{error}</p>
                </form>
            </div>
        </div>
    )
}
