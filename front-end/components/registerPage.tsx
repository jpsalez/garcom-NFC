'use client'
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { saveSession } from "@/lib/session";
import { login, register } from "@/services/auth";
import { BorderBeam } from "./ui/border-beam";

function registerErrorMessage(err: unknown) {
    if (err instanceof ApiError && (err.status === 409 || err.status === 429)) return err.message
    if (err instanceof ApiError && err.status === 400) return 'Confira os dados: a senha precisa ter de 8 a 128 caracteres.'
    return 'Não foi possível cadastrar. Tente novamente.'
}

export default function RegisterPage() {
    const router = useRouter()
    const [form, setForm] = useState({ restaurantName: '', name: '', email: '', password: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const set = (field: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [field]: e.target.value })

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            await register(form)
            // O restaurante já nasce pronto para o dono: entra direto e vai cadastrar as mesas
            saveSession(await login(form.email, form.password))
            router.push('/admin/mesas')
        } catch (err) {
            setError(registerErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="page-div">
            <div className="form-background">
                <BorderBeam size={200} duration={3} colorFrom="#d4d4d8" colorTo="#71717a"/>

                <form onSubmit={handleSubmit} className="form-style">
                    <h2>Cadastrar restaurante</h2>

                    <input value={form.restaurantName} onChange={set('restaurantName')} placeholder="Nome do restaurante" maxLength={100} required autoComplete="organization" />
                    <input value={form.name} onChange={set('name')} placeholder="Seu nome" maxLength={100} required autoComplete="name" />
                    <input type="email" value={form.email} onChange={set('email')} placeholder="E-mail" required autoComplete="username" />
                    <input type="password" value={form.password} onChange={set('password')} placeholder="Senha (mínimo 8 caracteres)" minLength={8} maxLength={128} required autoComplete="new-password" />

                    <button disabled={loading} className="btn-primary">{loading ? 'Cadastrando...' : 'Cadastrar'}</button>

                    <p role="alert" className={`error ${error ? 'visible' : ''}`}>{error}</p>

                    <p className="text-sm">Já tem conta? <Link href="/login" className="underline">Entrar.</Link></p>
                </form>
            </div>
        </div>
    )
}
