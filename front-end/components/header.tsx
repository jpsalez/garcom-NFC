'use client'
import { useRouter } from "next/navigation";
import { FaRegUser } from "react-icons/fa";
import { useSession } from "@/lib/session";
import { logout } from "@/services/auth";

export default function Header() {
    const router = useRouter()
    const session = useSession()

    return (
        <header className="
            w-full
            grid grid-cols-[1fr_auto_1fr]
            items-center
            h-12 px-5
            shadow-lg
        ">
            <div></div>

            <span
                onClick={() => router.push('/')}
                className="
                    cursor-pointer
                    transition-all duration-300
                    hover:scale-120 active:scale-120
                "
            >
                Psiu
            </span>

            <div className="flex items-center justify-end gap-3">
                {session && (
                    <button
                        onClick={() => { void logout(); router.push('/login') }}
                        className="w-auto p-0 text-sm underline cursor-pointer"
                    >Sair</button>
                )}
                <FaRegUser
                    onClick={() => router.push('/login')}
                    className="
                        cursor-pointer shrink-0
                        transition-all duration-300
                        hover:scale-125 active:scale-130
                    "
                />
            </div>
        </header>
    )
}
