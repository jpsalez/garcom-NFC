'use client'
import { FormEvent, useState } from "react";
import { BorderBeam } from "./ui/border-beam";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { saveSession } from "@/lib/session";
import { login } from "@/services/auth";
import { FaUser } from "react-icons/fa";

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


            
            <div className="flex flex-col items-center justify-center rounded-xl shadow-xl w-full
            lg:flex-row lg:items-start lg:w-full lg:max-w-300"
            >

                <div className="w-full max-w-200 aspect-4/3 rounded-l-xl bg-blue-600 hidden lg:flex items-center justify-center">
                    <h2 className="text-2xl text-background">IMAGEM AKI AAAAA</h2>
                </div>
                
                <div className="form-background bg-white! self-stretch max-w-100 lg:rounded-l-none flex items-center justify-center">

                    
                
                    <form onSubmit={handleSubmit} className="form-style w-full h-full">
                        <div className="flex flex-col items-center justify-center space-y-2 text-sm">

                            <div className="relative w-15 flex items-center justify-center aspect-square border rounded-full">
                                <BorderBeam />
                                <FaUser className="text-2xl"/>
                            </div>
                            
                            <h2 className="font-bold text-xl text-center">É bom ter você de volta!</h2>
                            <p className="text-center">Faça Login para continuar</p>
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

                        <div className="w-full text-center space-y-2">
                            <div className="w-full flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                    <input type="checkbox" name="" id=""/>
                                    <span className="text-sm line-clamp-1">Salvar login</span>
                                </div>
                                <Link href="/esqueci-senha" className="underline text-sm line-clamp-1">Esqueci minha senha</Link>
                            </div>
                            <div className="text-center">
                                <p className="">Ainda não tem conta?</p>
                                <Link href="/cadastro" className="underline text-sm">Cadastre seu restaurante.</Link>
                            </div>
                        </div>
                    </form>
                </div>

            </div>

        </div>
    )
}
