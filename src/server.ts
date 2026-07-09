import { buildApp } from "./app";
import { env } from "./config/env";

async function main() {
  const app = buildApp();

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info(`Warpion API a correr em http://localhost:${env.PORT}`);
    app.log.info(`Documentação Swagger em http://localhost:${env.PORT}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
