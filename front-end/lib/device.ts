// Aparelho do cliente na mesa: o scan devolve um token só deste celular (guardado só o hash no servidor).
export type Device = {
  token: string;
  expires_at: string;
  table: { label: string };
  restaurant: { name: string };
};

const key = (code: string) => `psiu.device.${code}`;

// null se não houver, estiver vencido ou corrompido (aí o scan roda de novo)
export function readDevice(code: string): Device | null {
  try {
    const raw = localStorage.getItem(key(code));
    const device = raw ? (JSON.parse(raw) as Device) : null;
    // Dado velho ou de outra versão (sem algum campo) é descartado: o scan roda de novo
    const valid = device?.token && device.table?.label && device.restaurant?.name && Date.parse(device.expires_at) > Date.now();
    return valid ? device : null;
  } catch {
    return null;
  }
}

// Navegador sem armazenamento (aba privada, cota cheia): segue só com o token em memória
export function saveDevice(code: string, device: Device) {
  try {
    localStorage.setItem(key(code), JSON.stringify(device));
  } catch {
    // sem persistência
  }
}

export function clearDevice(code: string) {
  try {
    localStorage.removeItem(key(code));
  } catch {
    // sem persistência
  }
}
