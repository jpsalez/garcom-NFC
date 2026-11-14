import { NextRequest, NextResponse } from "next/server"

// atualizar restaurante
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ restaurantId: string }> }
) {
    const { restaurantId } = await params
    const token = request.cookies.get('token')?.value
    const body = await request.json()

    const res = await fetch(`${process.env.API_URL}/admin/restaurants/${restaurantId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    })

    const data = await res.json()

    if (!res.ok) {
        return NextResponse.json(
            { message: data.message || 'Erro ao atualizar restaurante' },
            { status: res.status }
        )
    }

    return NextResponse.json(data)
}