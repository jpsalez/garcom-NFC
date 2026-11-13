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
            flex items-center justify-center
            h-12 px-5
            shadow-lg 
            ">
                <div className="flex flex-none"></div>

                <div className="w-full flex-1 flex items-center justify-center">
                    <span
                    onClick={() => router.push('/')}
                    className="cursor-pointer 
                    transition-all duration-300
                    hover:scale-120 active:scale-120
                    "
                    >Psiu</span>
                </div>

                <div className="flex flex-none">
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