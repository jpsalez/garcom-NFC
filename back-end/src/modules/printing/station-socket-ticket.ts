import jwt from "jsonwebtoken";

const audience = "psiu:print-station";

function secret() {
  const key = process.env.JWT_SECRET;
  if (!key) throw new Error("JWT_SECRET não definido no .env");
  return key;
}

export function signStationSocketTicket(credentialHash: string) {
  return jwt.sign({ station_hash: credentialHash }, secret(), {
    algorithm: "HS256", audience, expiresIn: "1m",
  });
}

export function readStationSocketTicket(ticket: string) {
  const payload = jwt.verify(ticket, secret(), { algorithms: ["HS256"], audience });
  if (typeof payload === "string" || typeof payload.station_hash !== "string" || !/^[a-f0-9]{64}$/.test(payload.station_hash)) {
    throw new Error("Ingresso da estação inválido");
  }
  return payload.station_hash;
}
