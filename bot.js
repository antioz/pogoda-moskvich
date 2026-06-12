// Actions-обёртка: одна ежедневная рассылка во все чаты. Для GitHub Actions cron.
// Постоянный процесс на VPS использует server.js.

import { loadState, saveState } from "./src/store.js";
import { broadcast } from "./src/core.js";

const TOKEN = process.env.BOT_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const state = await loadState();

  if (DRY_RUN) {
    const r = await broadcast("", state, { dryRun: true });
    console.log(`чатов: ${r.total} | пример: ${r.sample}`);
    console.log("[--dry-run] рассылка пропущена");
    return;
  }
  if (!TOKEN) throw new Error("Нужна переменная окружения BOT_TOKEN");

  const r = await broadcast(TOKEN, state);
  await saveState(state);
  console.log(`Отправлено: ${r.ok}, выкинуто: ${r.dropped} (из ${r.total})`);
}

main().catch((e) => {
  console.error("Ошибка:", e.message);
  process.exit(1);
});
