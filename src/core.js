// Общая логика бота: обработка апдейтов (регистрация чатов + гайды) и ежедневная
// рассылка. Используется и Actions-скриптами (poll.js, bot.js), и постоянным
// процессом на VPS (server.js).

import { getMoscowWeather } from "./weather.js";
import { generateMessage, categoryKey } from "./phrases.js";
import { sendToChannel } from "./telegram.js";
import { tgCall } from "./tg.js";

const ACTIVE = new Set(["member", "administrator", "creator"]);
const GONE = new Set(["left", "kicked"]);
// Признаки того, что бот в этом чате больше не нужен — выкидываем из рассылки.
const DEAD = /\b403\b|chat not found|kicked|blocked|deactivated|not enough rights/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chatTitle(chat) {
  return (
    chat.title ||
    [chat.first_name, chat.last_name].filter(Boolean).join(" ") ||
    chat.username ||
    ""
  );
}

// Полное руководство — для лички. weatherLine — погода прям сейчас.
function guideText(weatherLine) {
  return [
    "Москвич. Начни утро с дерьмовых новостей о погоде.",
    "Прогноз присылаю в 07:00 (если проснусь).",
    "",
    "хочешь меня себе в чат:",
    "• в группу — добавь меня обычным участником;",
    "• в канал — добавь админом с правом публикации.",
    "",
    `сегодня вот: *${weatherLine}*`,
  ].join("\n");
}

async function getUpdates(token, offset, timeout) {
  const data = await tgCall(
    token,
    "getUpdates",
    { offset, timeout, allowed_updates: ["my_chat_member", "message"] },
    { timeoutMs: timeout * 1000 + 10000 }
  );
  if (!data.ok) throw new Error(`getUpdates: ${data.error_code} ${data.description}`);
  return data.result;
}

/**
 * Забирает одну порцию апдейтов, мутирует state (offset, chats), шлёт гайды новичкам
 * и в ответ на /start, /help. timeout=0 — мгновенный опрос (Actions); >0 — long-poll (VPS).
 * @returns {Promise<{count:number, added:number, removed:number}>}
 */
async function processUpdates(token, state, { timeout = 0 } = {}) {
  const updates = await getUpdates(token, state.offset, timeout);

  const toGuide = new Set();
  let added = 0;
  let removed = 0;

  for (const u of updates) {
    state.offset = u.update_id + 1;

    if (u.my_chat_member) {
      const { chat, new_chat_member } = u.my_chat_member;
      const id = String(chat.id);
      if (ACTIVE.has(new_chat_member.status)) {
        // Группы/каналы регистрируем молча — приветствие при добавлении не шлём.
        if (!state.chats[id]) added++;
        state.chats[id] = { title: chatTitle(chat), type: chat.type, addedAt: new Date().toISOString() };
      } else if (GONE.has(new_chat_member.status)) {
        if (state.chats[id]) {
          delete state.chats[id];
          removed++;
        }
      }
    }

    const msg = u.message;
    if (msg?.chat?.type === "private" && /^\/(start|help)\b/.test(msg.text || "")) {
      const id = String(msg.chat.id);
      if (msg.text.startsWith("/start") && !state.chats[id]) added++;
      state.chats[id] = { title: chatTitle(msg.chat), type: msg.chat.type, addedAt: new Date().toISOString() };
      toGuide.add(id);
    }
  }

  // Гайды отправляем «по возможности»: если погода/отправка отвалились — чат уже
  // зарегистрирован и offset продвинут, поэтому не роняем всю пачку апдейтов.
  if (toGuide.size) {
    try {
      const weather = await getMoscowWeather();
      for (const id of toGuide) {
        const line = generateMessage(weather);
        const text = guideText(line); // toGuide наполняется только из /start в личке
        try {
          await sendToChannel(token, id, text, { parseMode: "Markdown" });
        } catch (e) {
          console.error(`гайд ${id} не ушёл: ${e.message}`);
        }
      }
    } catch (e) {
      console.error(`гайды пропущены (погода недоступна): ${e.message}`);
    }
  }

  return { count: updates.length, added, removed };
}

/**
 * Ежедневная рассылка погоды во все чаты. Мутирует state (prune отвалившихся + lastRun).
 * dryRun — только показать пример, без отправки.
 * @returns {Promise<{ok:number, dropped:number, total:number, sample:string}>}
 */
async function broadcast(token, state, { dryRun = false } = {}) {
  const weather = await getMoscowWeather();
  const ids = Object.keys(state.chats);

  // Эскалация «опять»: сколько дней подряд та же категория погоды.
  const cat = categoryKey(weather);
  const streak = state.lastCategory === cat ? (state.streak || 0) + 1 : 1;
  const level = streak - 1; // день 1 → L0
  const sample = generateMessage(weather, { level });

  if (dryRun) return { ok: 0, dropped: 0, total: ids.length, sample };

  let ok = 0;
  let dropped = 0;
  for (const id of ids) {
    try {
      await sendToChannel(token, id, generateMessage(weather, { level }));
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

  state.lastRun = new Date().toISOString();
  state.lastCategory = cat;
  state.streak = streak;
  return { ok, dropped, total: ids.length, sample };
}

export { processUpdates, broadcast };
