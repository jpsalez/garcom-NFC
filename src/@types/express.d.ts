// Estende o Request do Express: todo handler enxerga req.id
// Só é preenchido nas rotas que passam pelo ensureAuthenticated
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export {};
