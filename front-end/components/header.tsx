'use client'
import { useRouter } from "next/navigation";
import { FaPowerOff, FaUser } from "react-icons/fa";
import { useSession } from "@/lib/session";
import { logout } from "@/services/auth";
import Image from "next/image";
import Link from "next/link";

export default function Header() {
    const router = useRouter()
    const session = useSession()

    return (
        <header className="
            w-full
            flex items-center
            h-20 px-5
            border-b-[0.5] shadow-lg shadow-foreground/30
        ">
            <Link href="/" className="max-w-30">
                <Image
                src={'/psiu-logo-azul.png'}
                width={1142}
                height={380}
                alt="Psiu — início"
                />
            </Link>

            <div className="flex-1"></div>

            <div className="flex items-center justify-end gap-3">

                <Link href="/login" aria-label="Entrar" className="text-xl shrink-0 transition-all duration-300 hover:scale-125 active:scale-130">
                    <FaUser />
                </Link>

                {session && (
                    <button type="button" aria-label="Sair"
                        onClick={() => { void logout(); router.push('/login') }}
                        className="w-auto p-0 text-xl cursor-pointer
                        transition-all duration-300
                        hover:scale-125 active:scale-130
                        "
                    >
                        <FaPowerOff />
                    </button>
                )}

            </div>
        </header>
    )
}
