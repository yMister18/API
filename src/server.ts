import cron from "node-cron";
import { buildApp } from "./app";
import { env } from "./config/env";
import { runInvestTierSync } from "./jobs/investTierSync";

async function main() {
  const app = buildApp();

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info(`Warpion API a correr em http://localhost:${env.PORT}`);
    app.log.info(`Documentação Swagger em http://localhost:${env.PORT}/docs`);

    // Reavalia diariamente o investTier de todos os utilizadores (gasto dos
    // últimos 30 dias), às 3h da manhã.
    cron.schedule("0 3 * * *", () => {
      runInvestTierSync(app.log).catch((err) => app.log.error(err, "Falha na sync diária de investTier"));
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
