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
        <div className="page-div">
            <div className="form-background">
                <BorderBeam size={200} duration={3} colorFrom="#d4d4d8" colorTo="#71717a"/>

                <form onSubmit={handleSubmit} className="form-style">
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

                    <button disabled={loading} className="btn-primary">{loading ? 'Entrando...' : 'Entrar'}</button>

                    <p role="alert" className={`error ${error ? 'visible' : ''}`}>{error}</p>

                    <p className="text-sm">Esqueceu sua senha? <Link href="/esqueci-senha" className="underline">Clique aqui.</Link></p>
                </form>
            </div>
        </div>
    )
}
