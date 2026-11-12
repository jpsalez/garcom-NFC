import { inject, injectable } from "tsyringe";
import type {
  CreateUserData,
  IAuthService,
  IRestaurantRepository,
  IUserRepository,
  LoginResult,
} from "./auth.interfaces.ts";
import type { createUserInput, loginUserInput } from "./auth.schema.ts";
import { role } from "../../../generated/prisma/enums.ts";
import { comparePassword, passwordHash } from "../../shared/utils/password.ts";
import { signToken } from "../../shared/utils/jwt.ts";
import { ConflictError, UnauthorizedError } from "../../shared/errors/http-errors.ts";

@injectable()
export class AuthService implements IAuthService {
  private readonly restaurantRepository: IRestaurantRepository;
  private readonly userRepository: IUserRepository;

  constructor(
    @inject("RestaurantRepository") restaurantRepository: IRestaurantRepository,
    @inject("UserRepository") userRepository: IUserRepository,
  ) {
    this.restaurantRepository = restaurantRepository;
    this.userRepository = userRepository;
  }

  // registro de usuário -> esse tipo de usuário é sempre ADMIN controla
  // pode criar outros usuários. TODO : criar outra função para isso
  async register(createUser: createUserInput) {
   
    const emailInUse = await this.userRepository.findByEmail(createUser.email);
    if (emailInUse) {
      throw new ConflictError("E-mail já cadastrado");
    }

    const userData: CreateUserData = {
      name: createUser.name,
      email: createUser.email,
      password_hash: await passwordHash(createUser.password),
      role: role.ADMIN,
    };

    const user = await this.userRepository.create(userData);

    // Nunca devolve o hash da senha
    const { password_hash, ...publicUser } = user;
    return publicUser;
  }

  // Login vale para ADMIN e STAFF: a role vem do banco e vai dentro do token
  async login(credentials: loginUserInput): Promise<LoginResult> {
    const user = await this.userRepository.findByEmail(credentials.email);

    // Mesma mensagem para e-mail inexistente e senha errada: não revela quais e-mails existem
    const validPassword = user ? await comparePassword(credentials.password, user.password_hash) : false;
    if (!user || !validPassword) {
      throw new UnauthorizedError("E-mail ou senha inválidos");
    }

    const token = signToken({
      sub: user.id,
      restaurantId: user.restaurant_id,
      role: user.role,
    });

    const { password_hash, ...publicUser } = user;
    return { token, user: publicUser };
  }





  
}
