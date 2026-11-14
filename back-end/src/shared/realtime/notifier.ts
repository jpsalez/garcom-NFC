// Avisa as telas do balcão em tempo real. Os services dependem só desta interface.
export interface INotifier {
  toRestaurant(restaurantId: string, event: string, payload: unknown): void;
}
