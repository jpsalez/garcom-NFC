'use client'
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/session";

// Menu do painel: STAFF só vê os chamados; OWNER também gerencia mesas e equipe
export default function AdminNav() {
    const session = useSession()
    const pathname = usePathname()
    if (!session) return null

    const items = [{ href: '/admin/waiter', label: 'Chamados' }]
    if (session.user.role === 'OWNER') items.push({ href: '/admin/mesas', label: 'Mesas' }, { href: '/admin/equipe', label: 'Equipe' })

    return(
        <nav aria-label="Painel" className="w-full flex gap-5 px-5 pt-4 border-b">
            {items.map((item) => (
                <Link key={item.href} href={item.href} prefetch={false}
                className={`pb-2 ${pathname === item.href ? 'border-b-2 border-gray-900 font-bold' : 'text-gray-500'}`}>
                    {item.label}
                </Link>
            ))}
        </nav>
    )
}
