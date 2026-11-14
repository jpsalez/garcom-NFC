'use client'
import { useRouter } from "next/navigation";
import { FaRegUser } from "react-icons/fa";

export default function Header() {

    const router = useRouter()
    
    return(
        <>
            <header 
            className="
            w-full
            grid grid-cols-[40_1fr_40]
            h-12 px-5
            shadow-lg 
            ">
                <div className=""></div>

                <div className="w-full flex items-center justify-center">
                    <span
                    onClick={() => router.push('/')}
                    className="cursor-pointer text-center
                    transition-all duration-300
                    hover:scale-120 active:scale-120
                    "
                    >Psiu</span>
                </div>

                <div className="flex items-center justify-center">
                    <FaRegUser onClick={() => router.push('/login')} 
                    className="cursor-pointer 
                    transition-all duration-300
                    hover:scale-125 active:scale-130
                    "
                    fill=""/>
                </div>
                
            </header>
        </>
    )
}