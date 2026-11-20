'use client'
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { saveSession } from "@/lib/session";
import { login } from "@/services/auth";
import Image from "next/image";
import { IoIosArrowRoundForward } from "react-icons/io";

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

                <div className="relative w-full max-w-200 aspect-4/3 rounded-l-xl bg-blue-600 hidden lg:flex items-center justify-center overflow-hidden">
                    <Image
                    src={'/login.png'}
                    fill
                    alt="Psiu logo"
                    />
                </div>

                <div className="form-background bg-white! self-stretch max-w-100 lg:rounded-l-none flex items-center justify-center">



                    <form onSubmit={handleSubmit} className="form-style w-full h-full">
                        <div className="w-full flex flex-col items-start justify-center space-y-2 text-sm">

                            <h2 className="font-bold text-3xl ">É bom ter você de volta!</h2>
                            <p className="text-gray-600">Faça Login para continuar.</p>
                        </div>

                        <div className="w-full">
                            <p className="font-bold">E-mail</p>

                            <input type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="bg-none! bg-transparent! border-0! border-b-2! rounded-b-none border-foreground! shadow-none!"
                            placeholder="seu@email.com"
                            autoComplete="username"
                            required
                            />
                        </div>

                        <div className="w-full">
                            <p className="font-bold">Senha</p>
                            <input type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="bg-none! bg-transparent! border-0! border-b-2! rounded-b-none border-foreground! shadow-none!"
                            placeholder="Senha"
                            autoComplete="current-password"
                            required
                            />
                        </div>

                        <div className="w-full text-center space-y-2">
                            <div className="w-full flex items-center justify-end">
                                <Link href="/esqueci-senha" className="font-extrabold text-sm line-clamp-1">Esqueci minha senha</Link>
                            </div>

                        </div>

                        <button disabled={loading} className="btn-primary font-bold gap-x-2">
                            {loading && <span>Entrando...</span>}
                            <div className="flex items-center justify-center">
                                <span className="">Entrar</span>
                                <IoIosArrowRoundForward className="text-lg text-green-500"/>
                            </div>
                    </button>
                        <p role="alert" className={`error ${error ? 'visible' : ''}`}>{error}</p>

                        <div className="text-center">
                            <p className="text-lg">Ainda não tem conta?</p>
                            <Link href="/cadastro" className="font-extrabold text-sm">Cadastre seu restaurante aqui</Link>
                        </div>

                    </form>
                </div>

            </div>

        </div>
    )
}
