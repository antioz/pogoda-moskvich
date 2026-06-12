// Транспорт к Telegram Bot API с авто-пином IP.
//
// Зачем: на российском VPS (Timeweb) РКН душит часть IP api.telegram.org,
// DNS отдаёт мёртвый адрес, IPv6 без аплинка. Решение — коннектиться напрямую
// на живой IP, проверяя TLS по имени api.telegram.org (SNI + Host).
//
// На обычной среде (GitHub Actions) DNS живой → пин не нужен, код идёт прямым путём.
// Реализация на node:https — без внешних зависимостей.

import https from "node:https";

const HOST = "api.telegram.org";

// Кандидаты на случай, если DNS отдаёт задушенный адрес. Набор «живых» у РКН
// меняется, поэтому перебираем и закрепляем тот, что ответил.
const CANDIDATE_IPS = [
  "149.154.167.220",
  "149.154.167.197",
  "149.154.175.50",
  "149.154.175.53",
  "91.108.56.130",
];

let pinnedIp = null; // null → обычный DNS

function httpsPost(connectTo, token, method, params, timeoutMs) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(params || {});
    const req = https.request(
      {
        host: connectTo || HOST, // куда коннектимся (IP или имя)
        servername: HOST, // SNI для TLS
        port: 443,
        method: "POST",
        path: `/bot${token}/${method}`,
        headers: {
          Host: HOST,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`bad json (${res.statusCode}): ${data.slice(0, 120)}`));
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function probeLiveIp(token) {
  for (const ip of CANDIDATE_IPS) {
    try {
      const r = await httpsPost(ip, token, "getMe", {}, 8000);
      if (r && r.ok) return ip;
    } catch {
      /* пробуем следующий */
    }
  }
  return null;
}

/**
 * Вызов метода Bot API. Возвращает разобранный JSON-ответ Telegram ({ok, result|description}).
 * Сам находит живой IP при сетевом сбое и закрепляет его на последующие вызовы.
 */
async function tgCall(token, method, params, { timeoutMs = 35000 } = {}) {
  try {
    return await httpsPost(pinnedIp, token, method, params, timeoutMs);
  } catch (e) {
    const ip = await probeLiveIp(token);
    if (!ip) throw e; // живых IP не нашли — отдаём исходную ошибку
    pinnedIp = ip;
    return await httpsPost(pinnedIp, token, method, params, timeoutMs);
  }
}

export { tgCall };
