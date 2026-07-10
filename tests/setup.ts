// Valores fictícios para satisfazer o schema de src/config/env.ts em testes,
// sem depender de um ficheiro .env real nem de segredos verdadeiros.
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/warpion_test";
process.env.JWT_SECRET ??= "test-jwt-secret-0123456789abcdef";
process.env.COOKIE_SECRET ??= "test-cookie-secret-0123456789abcdef";
process.env.DISCORD_CLIENT_ID ??= "test-discord-client-id";
process.env.DISCORD_CLIENT_SECRET ??= "test-discord-client-secret";
process.env.DISCORD_CALLBACK_URL ??= "http://localhost:3333/auth/discord/callback";
process.env.INTERNAL_API_KEY ??= "test-internal-api-key";
process.env.FRONTEND_URL ??= "http://localhost:5173";
