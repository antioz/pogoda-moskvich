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

async function main() {
  if (!TOKEN) throw new Error("Нужна переменная окружения BOT_TOKEN");

  const state = await loadState();
  const updates = await getUpdates(state.offset);

  const newlyAdded = []; // chat_id, которым шлём приветствие
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
          newlyAdded.push(id);
        }
        state.chats[id] = { title: chatTitle(chat), type: chat.type, addedAt: new Date().toISOString() };
      } else if (GONE.has(new_chat_member.status)) {
        if (state.chats[id]) {
          delete state.chats[id];
          removed++;
        }
      }
    }

    // Подписка в личке через /start.
    const msg = u.message;
    if (msg?.text?.startsWith("/start") && msg.chat.type === "private") {
      const id = String(msg.chat.id);
      if (!state.chats[id]) {
        added++;
        newlyAdded.push(id);
      }
      state.chats[id] = { title: chatTitle(msg.chat), type: msg.chat.type, addedAt: new Date().toISOString() };
    }
  }

  // Приветствие новичкам — один запрос погоды на всех.
  if (newlyAdded.length) {
    const weather = await getMoscowWeather();
    for (const id of newlyAdded) {
      const text = `блиииин привет, я Погода для москвичей. буду раз в день кидать сюда погоду по Москве. а вот прям щас:\n\n${generateMessage(weather)}`;
      try {
        await sendToChannel(TOKEN, id, text);
      } catch (e) {
        console.error(`приветствие ${id} не ушло: ${e.message}`);
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
