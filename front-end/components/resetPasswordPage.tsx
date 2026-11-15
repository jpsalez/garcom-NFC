'use client'
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { resetPassword } from "@/services/auth";

function resetErrorMessage(err: unknown) {
    if (err instanceof ApiError && err.code === 'RESET_TOKEN_INVALID') return 'Link inválido ou expirado. Peça um novo.'
    if (err instanceof ApiError && err.status === 400) return 'A senha precisa ter de 8 a 128 caracteres.'
    return 'Não foi possível redefinir. Tente novamente.'
}

export default function ResetPasswordPage() {
    const token = useSearchParams().get('token') ?? ''
    const [password, setPassword] = useState('')
    const [done, setDone] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            await resetPassword(token, password)
            setDone(true)
        } catch (err) {
            setError(resetErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="page-div">
            <div className="form-background">
                <form onSubmit={handleSubmit} className="form-style">
                    <h2>Nova senha</h2>

                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nova senha (mínimo 8 caracteres)" autoComplete="new-password" minLength={8} maxLength={128} required />

                    <button disabled={loading || done || !token} className="btn-primary">{loading ? 'Salvando...' : 'Salvar'}</button>

                    <p role="alert" className={`error ${error ? 'visible' : ''}`}>{error}</p>
                    <p role="status" className={`success ${done ? 'visible' : ''}`}>Senha alterada. Entre com a nova senha.</p>

                    <Link href="/login" className="text-sm underline">Ir para o login</Link>
                </form>
            </div>
        </div>
    )
}
