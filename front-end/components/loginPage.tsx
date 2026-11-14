'use client'
import { FormEvent, useState } from "react";
import { BorderBeam } from "./ui/border-beam";
import { login } from "@/services/auth";

export default function LoginPage() {

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()

        try{
            const data = await login(email, password)
            console.log(data)
        } catch(err) {
            console.error(err)
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
                    
                    <input type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Usuário"
                    />
                    <input type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Senha"
                    />
                    <div className="w-full">
                        <button className="w-full p-3 bg-linear-130 from-gray-300 via-gray-100 to-gray-300 outline outline-gray-300  rounded-lg shadow-lg
                           
                        ">Entrar</button>
                    </div>

                    <p className="text-sm">Esqueceu sua senha? <a className="underline cursor-pointer">Clique aqui.</a></p>
                </form>
            </div>
                
            
        </div>
        </>
    )
}