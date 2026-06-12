// Точка входа. Один прогон: погода → фраза → пост в канал.
// Запускается планировщиком (GitHub Actions cron) раз в день.

import { getMoscowWeather } from "./src/weather.js";
import { generateMessage } from "./src/phrases.js";
import { sendToChannel } from "./src/telegram.js";

const TOKEN = process.env.BOT_TOKEN;
const CHANNEL = process.env.CHANNEL_ID;
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const weather = await getMoscowWeather();
  const message = generateMessage(weather);

  console.log(
    `Погода: max=${weather.tempMax}° min=${weather.tempMin}° ` +
      `code=${weather.code} cloud=${weather.cloud}%`
  );
  console.log(`Сообщение: ${message}`);

  if (DRY_RUN) {
    console.log("[--dry-run] отправка пропущена");
    return;
  }

  if (!TOKEN || !CHANNEL) {
    throw new Error("Нужны переменные окружения BOT_TOKEN и CHANNEL_ID");
  }

  await sendToChannel(TOKEN, CHANNEL, message);
  console.log("Отправлено в канал");
}

main().catch((err) => {
  console.error("Ошибка:", err.message);
  process.exit(1);
});
