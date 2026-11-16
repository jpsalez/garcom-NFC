'use client'
import { FormEvent, useState } from "react";
import { BorderBeam } from "./ui/border-beam";
import Link from "next/link";
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
            saveSession(session)
            router.push(session.user.role === 'SUPER_ADMIN' ? '/admin/restaurantes' : '/admin/waiter')
        } catch(err) {
            setError(loginErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }
    
    return(
        <div className="page-div py-10!">


            
            <div className="grid grid-cols-1 shadow-xl 
            md:grid-rows-1 md:grid-cols-2 md:h-full md:w-full md:max-w-300">

                <div className="w-full rounded-l-xl bg-blue-600 hidden md:flex items-center justify-center">
                    <h2 className="text-2xl text-background">IMAGEM AKI AAAAA</h2>
                </div>
                
                <div className="form-background md:rounded-l-none flex items-center justify-center">
                    <BorderBeam size={200} duration={3} colorFrom="#d4d4d8" colorTo="#71717a"/>
                
                    <form onSubmit={handleSubmit} className="form-style">
                        <div className="text-center text-sm">
                            <h2 className="font-bold text-xl">É bom ter você de volta!</h2>
                            <p>Faça Login para continuar</p>
                        </div>
                        <input type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="bg-none! bg-transparent! border-0! border-b-2! rounded-b-none border-foreground! shadow-none!"
                        placeholder="E-mail"
                        autoComplete="username"
                        required
                        />
                        <input type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="bg-none! bg-transparent! border-0! border-b-2! rounded-b-none border-foreground! shadow-none!"
                        placeholder="Senha"
                        autoComplete="current-password"
                        required
                        />
                        <button disabled={loading} className="btn-primary">{loading ? 'Entrando...' : 'Entrar'}</button>
                        <p role="alert" className={`error ${error ? 'visible' : ''}`}>{error}</p>
                        <div className="text-center space-y-2">
                            <p className="text-sm">Esqueceu sua senha? <Link href="/esqueci-senha" className="underline">Clique aqui.</Link></p>
                            <p className="text-sm">Ainda não tem conta? <Link href="/cadastro" className="underline">Cadastre seu restaurante.</Link></p>
                        </div>
                    </form>
                </div>

            </div>

        </div>
    )
}
