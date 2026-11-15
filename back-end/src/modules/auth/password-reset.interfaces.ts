export interface IPasswordResetService {
  // Responde igual para qualquer e-mail: não revela quem tem conta
  request(email: string): Promise<void>;
  reset(token: string, password: string): Promise<void>;
}
