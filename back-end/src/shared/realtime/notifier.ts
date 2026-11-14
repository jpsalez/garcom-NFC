// Avisa as telas do balcão em tempo real. Os services dependem só desta interface.
export interface INotifier {
  toRestaurant(restaurantId: string, event: string, payload: unknown): void;
  // Usuário desativado/excluído ou restaurante desativado perde a conexão na hora (o JWT só é checado ao conectar)
  disconnectUser(userId: string): void;
  disconnectRestaurant(restaurantId: string): void;
}
