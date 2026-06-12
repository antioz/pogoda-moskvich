// Генератор нытья про погоду. Бот ВСЕГДА ноет, но это всё-таки ПРОГНОЗ:
// в каждой фразе есть температура цифрой и краткий ярлык состояния.
//
// Грамматика:
//   [звук ворчания] [повтор?] [сегодня?] [+темп ярлык [весь день]] [оценка?] [доп со связкой?] [эмодзи]
// Пример: "бля опять сегодня +12 дождь весь день достало ☔"
//
// level (0..4) — эскалация «опять» при повторе той же погоды N дней подряд.
// КАПС включается только на L4 (когда реально достало много дней подряд).
// Спека и источники тона: PHRASES_SPEC.md.

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
function maybe(p) {
  return Math.random() < p;
}
function fmt(t) {
  const r = Math.round(t);
  return r > 0 ? `+${r}` : `${r}`;
}

// --- WMO-категории ---
const HAIL = new Set([96, 99]);
const FREEZING = new Set([56, 57, 66, 67]);
const SNOW = new Set([71, 73, 75, 77, 85, 86]);
const RAIN = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82]);
const FOG = new Set([45, 48]);
const ALLDAY_MM = 8; // осадки за день ≥ → «весь день»

// Фокус. Температурный экстремум важнее осадков. Паники больше нет —
// град/ледяной дождь стали обычными ныть-категориями.
function classify({ tempMax, code, cloud }) {
  if (FREEZING.has(code)) return "ice";
  if (HAIL.has(code)) return "dog"; // град → к грозе
  if (tempMax >= 27) return "heat";
  if (tempMax <= -10) return "frost";
  if (code === 95) return "dog";
  if (SNOW.has(code)) return "snow";
  if (RAIN.has(code)) return "rain";
  if (FOG.has(code)) return "fog";
  return (cloud ?? 0) >= 60 ? "overcast" : "clear";
}

function categoryKey(w) {
  return classify(w);
}

// Краткий ярлык состояния (это прогноз!).
const LABEL = {
  heat: "жара", frost: "мороз", rain: "дождь", snow: "снег", dog: "гроза",
  fog: "туман", ice: "ледяной дождь", overcast: "пасмурно", clear: "ясно",
};
const EMOJI = {
  heat: "🥵", frost: "🥶", rain: "☔", snow: "❄️", dog: "⛈",
  fog: "🌫", ice: "🧊", overcast: "☁️", clear: "🌤",
};

// --- Слот «звук ворчания» ---
const GRUMBLE = [
  "бля", "бляя", "бляяя", "епт", "ёпта", "сук", "суука", "аааа", "ну блин",
  "блин", "блииин", "баалин", "пфф", "пффф", "пупупу", "эх", "эхх", "ох",
  "ухх", "фу", "тьфу", "ой-ёй", "бррр", "млять", "ёлки", "фух", "гспди",
  "да блин", "ну вот", "тьфу ты", "ёёё", "о нет",
];
const GRUMBLE_HARD = ["блядь", "пиздец", "ну пиздец"];

// --- Слот «повтор» по уровню ---
const REPEAT = [
  ["", "", "опять"],                               // L0
  ["опять", "ну опять", "снова"],                  // L1
  ["опяять", "опять блин", "сколько можно"],       // L2
  ["опяяять", "да сколько можно", "заебало уже"],  // L3
  ["опяяять", "да сколько можно", "заебало"],      // L4 (капс наложится сверху)
];

// --- Слот «оценка» (бесродовые бурчалки) ---
const EVAL = [
  "дрянь", "мерзость", "достало", "заебало", "жесть", "кошмар", "ужас",
  "сил нет", "когда это кончится", "ну за что", "фу", "капец", "сдохнуть",
  "невыносимо", "отвратительно", "тоска", "ненавижу", "всё бесит",
  "хоть вешайся", "не выходи лучше", "сиди дома", "достало уже", "за что это",
];

// --- Слот «доп со связкой» ---
const LINKS = ["да ещё и", "ещё блин", "вдобавок", "и сверху", "плюс", "а тут ещё"];
const EXTRA_EVENTS = [
  "ветрище", "ветер с ног валит", "слякоть", "грязища", "сырость",
  "лужи везде", "гроза эта", "ледяной дождь", "гололёд",
];

function grumble(level) {
  if (level >= 3 && maybe(0.05)) return pick(GRUMBLE_HARD);
  return pick(GRUMBLE);
}

/**
 * @param {object} w  погода: tempMax, code, cloud, precip?, wind?
 * @param {{level?:number}} opts  level 0..4
 * @returns {string}
 */
function generateMessage(w, { level = 0 } = {}) {
  const cat = classify(w);
  const t = fmt(w.tempMax);
  const lvl = Math.min(level, 4);
  const parts = [];

  // звук
  parts.push(grumble(level));

  // повтор
  const rep = pick(REPEAT[lvl]);
  if (rep) parts.push(rep);

  // сегодня — интонация прогноза, не личного сообщения
  if (maybe(0.6)) parts.push("сегодня");

  // ГЛАВНОЕ: температура цифрой + краткий ярлык [+ «весь день»]
  let main = `${t} ${LABEL[cat]}`;
  if ((cat === "rain" || cat === "snow") && (w.precip ?? 0) >= ALLDAY_MM) {
    main += " весь день";
  }
  parts.push(main);

  // оценка
  if (maybe(0.7)) parts.push(pick(EVAL));

  // доп: ветер сильный → чаще про ветер; иначе изредка случайное событие
  if ((w.wind ?? 0) >= 40 && maybe(0.6)) {
    parts.push(`${pick(LINKS)} ${pick(["ветрище", "ветер с ног валит"])}`);
  } else if (maybe(lvl >= 3 ? 0.25 : 0.1)) {
    parts.push(`${pick(LINKS)} ${pick(EXTRA_EVENTS)}`);
  }

  let s = parts.join(" ");
  if (lvl >= 4) s = s.toUpperCase(); // капс только когда реально достало
  return `${s} ${EMOJI[cat]}`;
}

export { generateMessage, categoryKey, fmt, pick };
