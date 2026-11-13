// Roda antes de cada arquivo de teste
import "reflect-metadata";
import { config } from "dotenv";

config({ path: ".env.test", override: true });
