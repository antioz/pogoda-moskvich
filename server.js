// Постоянный процесс для VPS: long-poll (мгновенные ответы на /start) +
// внутренний планировщик ежедневной рассылки на 07:00 МСК (04:00 UTC).
// Заменяет оба GitHub Actions воркфлоу — на VPS должен крутиться только ОН
// (два потребителя getUpdates конфликтуют).

import { loadState, saveState } from "./src/store.js";
import { processUpdates, broadcast } from "./src/core.js";
import { tgCall } from "./src/tg.js";

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error("Нужна переменная окружения BOT_TOKEN");
  process.exit(1);
}

const POLL_TIMEOUT = 25; // сек long-poll
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let state;

// Сериализуем запись state.json: poll-loop и daily могут пересечься.
let saveChain = Promise.resolve();
function persist() {
  saveChain = saveChain.then(() => saveState(state)).catch((e) => console.error("save:", e.message));
  return saveChain;
}

async function pollLoop() {
  for (;;) {
    try {
      const r = await processUpdates(TOKEN, state, { timeout: POLL_TIMEOUT });
      if (r.count) {
        await persist(); // продвинулся offset и/или список чатов
        if (r.added || r.removed) {
          console.log(`[poll] added=${r.added} removed=${r.removed} total=${Object.keys(state.chats).length}`);
        }
      }
    } catch (e) {
      console.error(`[poll] ${e.message} — пауза 5с`);
      await sleep(5000);
    }
  }
}

// мс до ближайших 04:00 UTC = 07:00 МСК (без перехода на летнее время).
function msUntilNext0400UTC() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 4, 0, 0, 0));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next - now;
}

async function runDaily() {
  try {
    const r = await broadcast(TOKEN, state);
    await persist();
    console.log(`[daily] отправлено=${r.ok} выкинуто=${r.dropped} из ${r.total} | "${r.sample}"`);
  } catch (e) {
    console.error(`[daily] ${e.message}`);
  }
}

function scheduleDaily() {
  const ms = msUntilNext0400UTC();
  console.log(`[daily] следующая рассылка через ${Math.round(ms / 60000)} мин`);
  setTimeout(async () => {
    await runDaily();
    scheduleDaily();
  }, ms);
}

// Прогрев: закрепить живой IP заранее (короткий таймаут), чтобы первый long-poll
// не висел на задушенном DNS-адресе. На обычной сети сработает мгновенно.
async function warmup() {
  try {
    const r = await tgCall(TOKEN, "getMe", {}, { timeoutMs: 8000 });
    if (r?.ok) console.log(`прогрев: бот @${r.result.username} доступен`);
  } catch (e) {
    console.error(`прогрев не удался (продолжаем): ${e.message}`);
  }
}

async function main() {
  state = await loadState();
  console.log(`старт. чатов: ${Object.keys(state.chats).length}, offset=${state.offset}`);
  await warmup();
  scheduleDaily();
  await pollLoop();
}

main();
