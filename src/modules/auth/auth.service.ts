import type { CreateUserData, RestaurantRepository, UserRepository } from "./auth.repository.ts";

export class AuthService {
  private readonly restaurantRepository: RestaurantRepository;
  private readonly userRepository: UserRepository;

  constructor(restaurantRepository: RestaurantRepository, userRepository: UserRepository) {
    this.restaurantRepository = restaurantRepository;
    this.userRepository = userRepository;
  }

  async register(createUser: CreateUserData) {
    const restaurantExist = await this.restaurantRepository.findById(createUser.restaurant_id);
    if (!restaurantExist) {
      throw new Error("Restaurante não encontrado");
    }

    const emailInUse = await this.userRepository.findByEmail(createUser.email);
    if (emailInUse) {
      throw new Error("E-mail já cadastrado");
    }

    return this.userRepository.create(createUser);
  }
}
