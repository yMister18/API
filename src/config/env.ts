import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  CORS_ORIGIN: z.string().optional(),

  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET deve ter pelo menos 16 caracteres"),
  COOKIE_SECRET: z.string().min(16, "COOKIE_SECRET deve ter pelo menos 16 caracteres"),
  SESSION_COOKIE_NAME: z.string().default("warpion_session"),

  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID é obrigatória"),
  DISCORD_CLIENT_SECRET: z.string().min(1, "DISCORD_CLIENT_SECRET é obrigatória"),
  DISCORD_CALLBACK_URL: z.string().url(),

  INTERNAL_API_KEY: z.string().min(8, "INTERNAL_API_KEY deve ter pelo menos 8 caracteres"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variáveis de ambiente inválidas:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = [
  env.FRONTEND_URL,
  ...(env.CORS_ORIGIN ? env.CORS_ORIGIN.split(",").map((s) => s.trim()) : []),
];
