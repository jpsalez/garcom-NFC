const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function login(email: string, password: string) {
    const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Erro ao realizar login");
    }

    return data;
}