// proxy.ts
import { NextRequest, NextResponse } from 'next/server'

const publicExact = ['/', '/login', '/esqueci-senha']
const publicPrefixes = ['/mesa/']

export function proxy(request: NextRequest) {
    const token = request.cookies.get('token')?.value
    const { pathname } = request.nextUrl

    const isPublicRoute =
        publicExact.includes(pathname) ||
        publicPrefixes.some((prefix) => pathname.startsWith(prefix))

    // Sem token tentando acessar área protegida -> manda pro login
    if (!token && !isPublicRoute) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // Com token tentando acessar o login -> manda pro dashboard
    if (token && pathname === '/login') {
        return NextResponse.redirect(new URL('/admin', request.url))
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
}