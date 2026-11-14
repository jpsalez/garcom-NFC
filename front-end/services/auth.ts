export async function login(email: string, password: string) {
    const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    })

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || "Erro ao realizar login");
    }

    return data;
}

export async function register(
    name: string,
    email:string,
    password: string,
    restaurantName: string
    ) {

    const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify({ name, email, password, restaurantName })
    })

    const data = await response.json()

    if (!response.ok) {
        throw new Error(data.message || "Erro ao cadastrar restaurante")
    }

    return data
}