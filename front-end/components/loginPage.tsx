'use client'
import { FormEvent, useState } from "react";
import { BorderBeam } from "./ui/border-beam";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { saveSession } from "@/lib/session";
import { login } from "@/services/auth";

function loginErrorMessage(err: unknown) {
    if (err instanceof ApiError && err.status === 401) return 'E-mail ou senha inválidos.'
    if (err instanceof ApiError && err.status === 429) return err.message
    return 'Não foi possível entrar. Tente novamente.'
}

export default function LoginPage() {

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setError('')
        setLoading(true)

        try{
            const session = await login(email, password)
            // SUPER_ADMIN não tem restaurante: ainda não há tela para ele
            if (session.user.role === 'SUPER_ADMIN') {
                setError('Este acesso é da plataforma e ainda não tem tela.')
                return
            }
            saveSession(session)
            router.push('/admin/waiter')
        } catch(err) {
            setError(loginErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }
    
    return(
        <>
        <div
        className="w-full flex items-center justify-center p-5 overflow-hidden"
        >            
                
            <div className="relative p-5 rounded-lg outline outline-gray-200 shadow-xl
            w-full max-w-100
            ">

                <BorderBeam size={200} duration={3} colorFrom="#d4d4d8" colorTo="#71717a"/>
                
                <form action=""
                onSubmit={handleSubmit}
                className="
                flex flex-col items-center justify-center space-y-5"
                >
                
                
                    <h2>Realizar Login</h2>
                    
                    <input type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="E-mail"
                    autoComplete="username"
                    required
                    />
                    <input type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Senha"
                    autoComplete="current-password"
                    required
                    />
                    {error && <p role="alert" className="text-sm text-red-600 text-center">{error}</p>}
                    <div className="w-full">
                        <button disabled={loading} className="w-full p-3 bg-linear-130 from-gray-300 via-gray-100 to-gray-300 outline outline-gray-300  rounded-lg shadow-lg
                           
                        ">{loading ? 'Entrando...' : 'Entrar'}</button>
                    </div>

                    <p className="text-sm">Esqueceu sua senha? <a className="underline cursor-pointer">Clique aqui.</a></p>
                </form>
            </div>
                
            
        </div>
        </>
    )
}