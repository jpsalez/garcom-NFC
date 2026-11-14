'use client'
import { FormEvent, useState } from "react";
import { login } from "@/services/auth";
import { BorderBeam } from "@/components/ui/border-beam";
import { useRouter } from "next/navigation";

export default function LoginPage() {

    const router = useRouter()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')

    const [error, setError] = useState('')
    const [showError, setShowError] = useState(false)

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()

        try{
            await login(email, password)
            router.push('/admin')
        } catch(err) {
            setError(err instanceof Error ? err.message : 'Erro inesperado')
            setShowError(true)
        }
    }
    
    return(
        <>
        <div
        className="page-div"
        >            
                
            <div className="form-background">

                <BorderBeam size={200} duration={3} colorFrom="#d4d4d8" colorTo="#71717a"/>
                
                <form action=""
                onSubmit={handleSubmit}
                className="form-style"
                >
                
                
                    <h2>Realizar Login</h2>
                    
                    <input type="text"
                    value={email}
                    onChange={(e) => {
                        setShowError(false)
                        setEmail(e.target.value)
                    }}
                    placeholder="Usuário"
                    required
                    />

                    <input type="password"
                    value={password}
                    onChange={(e) => {
                        setShowError(false)
                        setPassword(e.target.value)
                    }}
                    placeholder="Senha"
                    required
                    />

                    <div className="w-full">
                        <button className="   
                        ">Entrar</button>
                    </div>

                    <p className={`error ${showError ? 'visible' : ''}`}>
                        {error}
                    </p>

                    <p className="text-sm">Esqueceu sua senha? <a className="underline cursor-pointer">Clique aqui.</a></p>
                </form>
            </div>
                
            
        </div>
        </>
    )
}