'use client'
import { FormEvent, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { forgotPassword } from "@/services/auth";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('')
    const [sent, setSent] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            await forgotPassword(email)
            setSent(true)
        } catch (err) {
            setError(err instanceof ApiError && err.status === 429 ? err.message : 'Não foi possível enviar. Tente novamente.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="page-div">
            <div className="form-background">
                <form onSubmit={handleSubmit} className="form-style">
                    <h2>Recuperar senha</h2>

                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="E-mail" autoComplete="username" required />

                    <button disabled={loading} className="btn-primary">{loading ? 'Enviando...' : 'Enviar link'}</button>

                    <p role="alert" className={`error ${error ? 'visible' : ''}`}>{error}</p>
                    <p role="status" className={`success ${sent ? 'visible' : ''}`}>Se o e-mail estiver cadastrado, enviaremos o link.</p>

                    <Link href="/login" className="text-sm underline">Voltar ao login</Link>
                </form>
            </div>
        </div>
    )
}
