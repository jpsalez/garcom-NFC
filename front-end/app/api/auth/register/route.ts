import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    const body = await request.json()

    const res = await fetch(`${process.env.API_URL}/auth/register`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
        })

        const data = await res.json()

        if (!res.ok) {
            return NextResponse.json(
                { message: data.message || 'Erro ao cadastrar restaurante' },
                { status: res.status }
            )
        }

        const response = NextResponse.json({ success: true })
        return response
}