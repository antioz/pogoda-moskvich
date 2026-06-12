// Отправка сообщения в Telegram-канал через Bot API.

/**
 * @param {string} token   токен бота от @BotFather
 * @param {string} chatId  @username канала или числовой chat_id
 * @param {string} text    текст поста
 */
async function sendToChannel(token, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram API: ${data.error_code} ${data.description}`);
  }
  return data.result;
}

export { sendToChannel };
