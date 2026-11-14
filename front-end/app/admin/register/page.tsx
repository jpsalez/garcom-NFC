'use client'
import { BorderBeam } from "@/components/ui/border-beam";
import { register } from "@/services/auth";
import { FormEvent, useState } from "react";

export default function Register() {

    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [restaurantName, setRestaurantName] = useState('')

    const [success, setSuccess] = useState('')
    const [showSuccess, setShowSuccess] = useState(false)

    const [error, setError] = useState('')
    const [showError, setShowError] = useState(false)

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setShowError(false)
        setShowSuccess(false)

        try {
            await register(name, email, password, restaurantName)
            setSuccess('Restaurante Cadastrado')
            setShowSuccess(true)
        } catch(err) {
            setError(err instanceof Error ? err.message : 'Erro inesperado')
            setShowError(true)
        }
    }
    
    return(
        <>
            <div className="page-div">

                <div className="form-background">

                    <BorderBeam size={200} duration={3} colorFrom="#d4d4d8" colorTo="#71717a"/>
                    
                    <form
                    onSubmit={handleSubmit}
                    className="form-style"
                    >

                        <h1>Cadastrar Restaurante</h1>

                        <input type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Nome do Dono"
                        required
                        />

                        <input type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="E-mail do Dono"
                        required
                        />

                        <input type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Senha do Dono"
                        minLength={8}
                        required
                        />

                        <input type="text"
                        value={restaurantName}
                        onChange={(e) => setRestaurantName(e.target.value)}
                        placeholder="Nome do Restaurante"
                        required
                        />

                        <button type="submit">Cadastrar</button>

                        <p className={`success ${showSuccess ? 'visible' : ''}`}>
                            {success}
                        </p>

                        <p className={`error ${showError ? 'visible' : ''}`}>
                            {error}
                        </p>

                    </form>
                </div>
            </div>
        </>
    )
}