import { NextRequest, NextResponse } from "next/server"

// listar restaurantes
export async function GET(request: NextRequest) {
    
    const token = request.cookies.get('token')?.value

    const res = await fetch(`${process.env.API_URL}/admin/restaurants`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
        },
        cache: 'no-store',
    })

    const data = await res.json()

    if (!res.ok) {
        return NextResponse.json(
            { message: data.message || 'Erro ao consultar restaurantes'},
            { status: res.status }
        )
    }

    return NextResponse.json(data)
}
