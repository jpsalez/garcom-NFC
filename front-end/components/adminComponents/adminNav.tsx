'use client'
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/session";
import { canAccessKitchen, canUsePdv } from "@/lib/kitchenQueue";

export default function AdminNav() {
    const session = useSession()
    const pathname = usePathname()
    if (!session) return null

    const items = session.user.role === 'SUPER_ADMIN' ? [{ href: '/admin/restaurantes', label: 'Restaurantes' }] : [{ href: '/admin/waiter', label: 'Chamados' }]
    if (session.user.role === 'OWNER') items.push({ href: '/admin/mesas', label: 'Mesas' }, { href: '/admin/equipe', label: 'Equipe' })

    if (session.user.role === 'OWNER' || (session.user.role === 'STAFF' && session.user.category === 'MANAGER')) items.push({ href: '/admin/cardapio', label: 'Cardápio' })

    if (session.user.role === 'OWNER' || (session.user.role === 'STAFF' && ['MANAGER', 'WAITER', 'KITCHEN'].includes(session.user.category ?? ''))) items.push({ href: '/admin/pedidos', label: 'Pedidos' })

    if (canUsePdv(session.user)) items.push({ href: '/admin/pdv', label: 'PDV' })

    if (canAccessKitchen(session.user)) items.push({ href: '/admin/cozinha', label: 'Cozinha' })

    items.push({ href: '/admin/configuracoes', label: 'Configurações' })
    const settings = ['/admin/configuracoes', '/admin/senha', '/admin/cozinha/configuracoes', '/admin/cozinha/impressao']

    return(
        <nav aria-label="Painel" className="w-full flex gap-5 overflow-x-auto px-5 pt-4 border-b">
            {items.map((item) => {
                const active = item.href === '/admin/configuracoes'
                    ? settings.includes(pathname) || pathname.startsWith('/admin/configuracoes/')
                    : pathname === item.href
                return (
                    <Link key={item.href} href={item.href} prefetch={false} aria-current={pathname === item.href ? 'page' : undefined}
                    className={`pb-2 ${active ? 'border-b-2 border-foreground font-bold' : 'text-gray-400'}`}>
                        {item.label}
                    </Link>
                )
            })}
        </nav>
    )
}
