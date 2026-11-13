import express from "express";
import type { Router, Request, Response } from "express";
import { container } from "./shared/container/container.ts";
import { validateSchema, validateUuidParams } from "./shared/middlewares/validator.middleware.ts";
import { AuthController } from "./modules/auth/auth.controller.ts";
import { AdministrationController } from "./modules/administration/administration.controller.ts";
import { createRestaurantSchema, setActiveSchema } from "./modules/administration/administration.schema.ts";
import { TablesController } from "./modules/tables/tables.controller.ts";
import { createTableSchema, updateTableSchema } from "./modules/tables/tables.schemas.ts";
import { StaffController } from "./modules/users/staff.controller.ts";
import { createRestaurantUserSchema, createStaffSchema, updateUserSchema } from "./modules/users/users.schema.ts";
import { loginLimiter, registerLimiter } from "./shared/middlewares/rate-limit.middleware.ts";
import { ensureAuthenticated, ensureRole } from "./shared/middlewares/auth.middleware.ts";
import { role } from "../generated/prisma/enums.ts";
import { createUserSchema, loginUserSchema } from "./modules/auth/auth.schema.ts";

export function SetupRoutes(){
    const router: Router = express.Router();

    const authController = container.resolve(AuthController);
    const administrationController = container.resolve(AdministrationController);
    const staffController = container.resolve(StaffController);
    const tablesController = container.resolve(TablesController);

    router.get('/health', (req: Request, res: Response) => {
        res.send({ message: 'API Healthy' })
    })

    router.post('/auth/register', registerLimiter, validateSchema(createUserSchema), authController.register);
    router.post('/auth/login', loginLimiter, validateSchema(loginUserSchema), authController.login);

    // SUPER_ADMIN: plataforma
    const superAdmin = [ensureAuthenticated, ensureRole(role.SUPER_ADMIN)];
    router.post('/admin/restaurants', ...superAdmin, validateSchema(createRestaurantSchema), administrationController.createRestaurant);
    router.get('/admin/restaurants', ...superAdmin, administrationController.listRestaurants);
    router.patch('/admin/restaurants/:restaurantId', ...superAdmin, validateUuidParams('restaurantId'), validateSchema(setActiveSchema), administrationController.setRestaurantActive);
    router.get('/admin/restaurants/:restaurantId/users', ...superAdmin, validateUuidParams('restaurantId'), administrationController.listUsers);
    router.post('/admin/restaurants/:restaurantId/users', ...superAdmin, validateUuidParams('restaurantId'), validateSchema(createRestaurantUserSchema), administrationController.createUser);
    router.patch('/admin/restaurants/:restaurantId/users/:id', ...superAdmin, validateUuidParams('restaurantId', 'id'), validateSchema(updateUserSchema), administrationController.updateUser);

    router.delete('/admin/restaurants/:restaurantId/users/:id', ...superAdmin, validateUuidParams('restaurantId', 'id'), administrationController.removeUser);

    // OWNER: equipe do próprio restaurante (restaurantId vem do token)
    const owner = [ensureAuthenticated, ensureRole(role.OWNER)];
    router.get('/staff', ...owner, staffController.list);
    router.post('/staff', ...owner, validateSchema(createStaffSchema), staffController.create);
    router.patch('/staff/:id', ...owner, validateUuidParams('id'), validateSchema(updateUserSchema), staffController.update);

    router.delete('/staff/:id', ...owner, validateUuidParams('id'), staffController.remove);

    // Mesas: OWNER gerencia, STAFF só consulta (restaurantId vem do token)
    const staffOrOwner = [ensureAuthenticated, ensureRole(role.OWNER, role.STAFF)];
    router.get('/tables', ...staffOrOwner, tablesController.list);
    router.post('/tables', ...owner, validateSchema(createTableSchema), tablesController.create);
    router.patch('/tables/:id', ...owner, validateUuidParams('id'), validateSchema(updateTableSchema), tablesController.update);

    return router;
}
