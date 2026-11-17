'use client'
import { FormEvent, useState } from "react";
import { ApiError } from "@/lib/api";
import { saveSession, useSession } from "@/lib/session";
import { changePassword } from "@/services/auth";

function changeErrorMessage(err: unknown) {
    if (err instanceof ApiError && err.code === 'INVALID_CURRENT_PASSWORD') return 'Senha atual incorreta.'
    if (err instanceof ApiError && err.status === 400) return 'A nova senha precisa ter de 8 a 128 caracteres e ser diferente da atual.'
    if (err instanceof ApiError && err.status === 429) return err.message
    return 'Não foi possível trocar a senha. Tente novamente.'
}

export default function ChangePasswordPage() {
    const session = useSession()
    const [current, setCurrent] = useState('')
    const [next, setNext] = useState('')
    const [confirm, setConfirm] = useState('')
    const [done, setDone] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        if (!session) return
        setError('')
        setDone(false)
        if (next !== confirm) {
            setError('A confirmação não confere com a nova senha.')
            return
        }
        setLoading(true)
        try {
            // A API grava o par de cookies novo deste aparelho: os outros precisam entrar de novo
            saveSession(await changePassword(current, next))
            setCurrent('')
            setNext('')
            setConfirm('')
            setDone(true)
        } catch (err) {
            setError(changeErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="page-div">
            <div className="form-background">
                <form onSubmit={handleSubmit} className="form-style">
                    <h2>Trocar senha</h2>

                    <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
                    placeholder="Senha atual" autoComplete="current-password" required />
                    <input type="password" value={next} onChange={(e) => setNext(e.target.value)}
                    placeholder="Nova senha (mínimo 8 caracteres)" autoComplete="new-password" minLength={8} maxLength={128} required />
                    <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repita a nova senha" autoComplete="new-password" minLength={8} maxLength={128} required />

                    <button disabled={loading} className="btn-primary">{loading ? 'Salvando...' : 'Salvar'}</button>

                    <p role="alert" className={`error ${error ? 'visible' : ''}`}>{error}</p>
                    <p role="status" className={`success ${done ? 'visible' : ''}`}>Senha alterada. Os outros aparelhos precisarão entrar de novo.</p>
                </form>
            </div>
        </div>
    )
}
