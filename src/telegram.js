// Отправка сообщения в Telegram-чат через Bot API (с авто-пином IP, см. tg.js).

import { tgCall } from "./tg.js";

/**
 * @param {string} token   токен бота от @BotFather
 * @param {string} chatId  @username канала или числовой chat_id
 * @param {string} text    текст поста
 * @param {{parseMode?: string}} [opts]
 */
async function sendToChannel(token, chatId, text, opts = {}) {
  const params = { chat_id: chatId, text };
  if (opts.parseMode) params.parse_mode = opts.parseMode;

  const data = await tgCall(token, "sendMessage", params);
  if (!data.ok) {
    throw new Error(`Telegram API: ${data.error_code} ${data.description}`);
  }
  return data.result;
}

export { sendToChannel };
