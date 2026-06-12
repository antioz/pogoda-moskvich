// Actions-обёртка: один мгновенный опрос Telegram (timeout=0). Для GitHub Actions cron.
// Постоянный процесс на VPS использует server.js.

import { loadState, saveState } from "./store.js";
import { processUpdates } from "./core.js";

const TOKEN = process.env.BOT_TOKEN;

async function main() {
  if (!TOKEN) throw new Error("Нужна переменная окружения BOT_TOKEN");
  const state = await loadState();
  const r = await processUpdates(TOKEN, state, { timeout: 0 });
  await saveState(state);
  console.log(
    `updates=${r.count} added=${r.added} removed=${r.removed} ` +
      `total=${Object.keys(state.chats).length} offset=${state.offset}`
  );
}

main().catch((e) => {
  console.error("poll error:", e.message);
  process.exit(1);
});
