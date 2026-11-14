'use client'
import { useRouter } from "next/navigation"

export default function Admin() {

    const router = useRouter()
    
    return(
        <>
            <div className="page-div">
                <button
                onClick={() => router.push('/admin/register')}
                >Adicionar restaurante</button>
            </div>
        </>
    )
}