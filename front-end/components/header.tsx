'use client'

import { useRouter } from "next/navigation";
import { FaRegUser } from "react-icons/fa";

export default function Header() {
    const router = useRouter()

    return (
        <header className="
            w-full
            grid grid-cols-[1fr_auto_1fr]
            items-center
            h-20 px-5
            border-b-[0.5] shadow-lg shadow-foreground/30
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

            <div className="flex justify-end">
                <FaRegUser
                    onClick={() => router.push('/login')}
                    className="
                        cursor-pointer
                        transition-all duration-300
                        hover:scale-125 active:scale-130
                    "
                />
            </div>
        </header>
    )
}