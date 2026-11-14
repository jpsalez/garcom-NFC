import { stringify } from "querystring"

// funcao para receber lista de restaurantes (ativos e inativos)
export async function getRestaurantsList() {
    const response = await fetch('/api/admin/restaurants', {
        method: 'GET',
        cache: 'no-store'
    })

    const data = await response.json()

    if (!response.ok) {
        throw new Error( data.message || 'Erro ao listar restaurantes')
    }

    return data
}

// funcao para atulizar status de restaurante (ativo ou inativo)
export async function updateRestaurantStatus(restaurantId: string, active: boolean) {
    const response = await fetch(`/api/admin/restaurants/${restaurantId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ active })
    })

    const data = await response.json()

    if (!response.ok) {
        throw new Error( data.message || 'Erro ao atualizar restaurante')
    }

    return data
}