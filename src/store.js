// «База данных бедняка»: состояние бота в data/state.json внутри репозитория.
// GitHub Actions коммитит файл обратно после изменений.
//
// Формат:
// {
//   "offset": <number>,                  // следующий update_id для getUpdates
//   "lastRun": "<ISO>",                   // отметка последней рассылки (heartbeat)
//   "chats": {
//     "<chat_id>": { title, type, addedAt }
//   }
// }

import { readFile, writeFile } from "node:fs/promises";

const STATE_PATH = new URL("../data/state.json", import.meta.url);

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_PATH, "utf8"));
  } catch {
    return { offset: 0, chats: {} };
  }
}

async function saveState(state) {
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

export { loadState, saveState };
