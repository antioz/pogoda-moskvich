// Слушатель: спрашивает у Telegram «что нового» (getUpdates) и ведёт список чатов,
// куда бота добавили. Запускается планировщиком раз в несколько минут.
//
// Реагирует на:
//  - my_chat_member  — бота добавили/кикнули из группы/канала
//  - /start в личке  — пользователь подписался в ЛС
// Новому чату сразу шлёт приветствие + текущую погоду (instant gratification).

import { loadState, saveState } from "./store.js";
import { getMoscowWeather } from "./weather.js";
import { generateMessage } from "./phrases.js";
import { sendToChannel } from "./telegram.js";

const TOKEN = process.env.BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;

const ACTIVE = new Set(["member", "administrator", "creator"]);
const GONE = new Set(["left", "kicked"]);

async function getUpdates(offset) {
  const res = await fetch(`${API}/getUpdates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      offset,
      timeout: 0,
      allowed_updates: ["my_chat_member", "message"],
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`getUpdates: ${data.error_code} ${data.description}`);
  return data.result;
}

function chatTitle(chat) {
  return (
    chat.title ||
    [chat.first_name, chat.last_name].filter(Boolean).join(" ") ||
    chat.username ||
    ""
  );
}

// Полное руководство — для лички. weatherLine — погода прям сейчас (курсив через *…*).
function guideText(weatherLine) {
  return [
    "блиииин, это погода для москвичей.",
    "",
    "каждое утро присылаю дерьмовую погоду(",
    "",
    "как пользоваться:",
    "• тут в 07:00 пришлю если смогу проснуться;",
    "• хочешь погоду в свой чат — добавь меня в группу обычным участником;",
    "• хочешь в канал — добавь админом с правом публикации.",
    "",
    `погода сейчас - *${weatherLine}*`,
  ].join("\n");
}

// Короткое приветствие — для группы/канала.
function groupGreetText(weatherLine) {
  return [
    "блиииин, это погода для москвичей.",
    "",
    "каждое утро буду присылать сюда дерьмовую погоду( в 07:00, если проснусь.",
    "выкинуть — просто удали меня из чата.",
    "",
    `погода сейчас - *${weatherLine}*`,
  ].join("\n");
}

async function main() {
  if (!TOKEN) throw new Error("Нужна переменная окружения BOT_TOKEN");

  const state = await loadState();
  const updates = await getUpdates(state.offset);

  const toGuide = new Set(); // chat_id, которым показать руководство
  let added = 0;
  let removed = 0;

  for (const u of updates) {
    state.offset = u.update_id + 1;

    // Бота добавили/удалили из группы или канала.
    if (u.my_chat_member) {
      const { chat, new_chat_member } = u.my_chat_member;
      const id = String(chat.id);
      if (ACTIVE.has(new_chat_member.status)) {
        if (!state.chats[id]) {
          added++;
          toGuide.add(id); // новому чату — приветствие с гайдом
        }
        state.chats[id] = { title: chatTitle(chat), type: chat.type, addedAt: new Date().toISOString() };
      } else if (GONE.has(new_chat_member.status)) {
        if (state.chats[id]) {
          delete state.chats[id];
          removed++;
        }
      }
    }

    // Команды в личке: /start подписывает, /start и /help всегда показывают гайд.
    const msg = u.message;
    if (msg?.chat?.type === "private" && /^\/(start|help)\b/.test(msg.text || "")) {
      const id = String(msg.chat.id);
      if (msg.text.startsWith("/start") && !state.chats[id]) added++;
      state.chats[id] = { title: chatTitle(msg.chat), type: msg.chat.type, addedAt: new Date().toISOString() };
      toGuide.add(id); // на любую команду отвечаем руководством
    }
  }

  // Руководство — один запрос погоды на всех, текст по типу чата.
  if (toGuide.size) {
    const weather = await getMoscowWeather();
    for (const id of toGuide) {
      const line = generateMessage(weather);
      const isPrivate = state.chats[id]?.type === "private";
      const text = isPrivate ? guideText(line) : groupGreetText(line);
      try {
        await sendToChannel(TOKEN, id, text, { parseMode: "Markdown" });
      } catch (e) {
        console.error(`гайд ${id} не ушёл: ${e.message}`);
      }
    }
  }

  await saveState(state);
  console.log(
    `updates=${updates.length} added=${added} removed=${removed} ` +
      `total=${Object.keys(state.chats).length} offset=${state.offset}`
  );
}

main().catch((e) => {
  console.error("poll error:", e.message);
  process.exit(1);
});
