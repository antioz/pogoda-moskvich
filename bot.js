// Ежедневная рассылка. Один прогон: погода → фраза → пост во ВСЕ чаты из state.
// Запускается планировщиком (daily.yml) раз в день.
// Чат, откуда бота кикнули/заблокировали, выкидывается из рассылки.

import { getMoscowWeather } from "./src/weather.js";
import { generateMessage } from "./src/phrases.js";
import { sendToChannel } from "./src/telegram.js";
import { loadState, saveState } from "./src/store.js";

const TOKEN = process.env.BOT_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Признаки того, что бот в этом чате больше не нужен.
const DEAD = /\b403\b|chat not found|kicked|blocked|deactivated|not enough rights/i;

async function main() {
  const weather = await getMoscowWeather();
  const state = await loadState();
  const ids = Object.keys(state.chats);

  console.log(
    `Погода: max=${weather.tempMax}° min=${weather.tempMin}° code=${weather.code} ` +
      `cloud=${weather.cloud}% | чатов: ${ids.length}`
  );

  if (DRY_RUN) {
    console.log("Пример сообщения:", generateMessage(weather));
    console.log("[--dry-run] рассылка пропущена");
    return;
  }
  if (!TOKEN) throw new Error("Нужна переменная окружения BOT_TOKEN");

  let ok = 0;
  let dropped = 0;
  for (const id of ids) {
    const message = generateMessage(weather); // своя случайная фраза каждому чату
    try {
      await sendToChannel(TOKEN, id, message);
      ok++;
    } catch (e) {
      if (DEAD.test(e.message)) {
        delete state.chats[id];
        dropped++;
        console.log(`выкинут ${id}: ${e.message}`);
      } else {
        console.error(`ошибка для ${id}: ${e.message}`);
      }
    }
    await sleep(50); // мягкий троттлинг под лимит Telegram (~30 msg/сек)
  }

  // Heartbeat: отметка прогона гарантирует ежедневный коммит → расписание Actions не отключится.
  state.lastRun = new Date().toISOString();
  await saveState(state);

  console.log(`Отправлено: ${ok}, выкинуто: ${dropped}`);
}

main().catch((e) => {
  console.error("Ошибка:", e.message);
  process.exit(1);
});
