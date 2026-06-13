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

// Каждое доп-событие подключается только если реальные показатели погоды
// его допускают. Предикат читает w (tempMax, tempMin, code, precip, wind, cloud).
// Никакого «при любой температуре» — лужи нужен дождь, гололёд нужен лёд и т.д.
const HEAT_MIN = 25;          // tempMax ≥ → «жара»: дождь даёт духоту и пыль, а не лужи
const EXTRA_EVENTS = [
  { text: "ветрище",            when: (w) => (w.wind ?? 0) >= 25 },
  { text: "ветер с ног валит",  when: (w) => (w.wind ?? 0) >= 35 },
  { text: "гроза эта",          when: (w) => w.code === 95 || HAIL.has(w.code) },
  // Жара: дождь = духота, сухой зной = пыль. Никаких луж/сырости/грязи.
  { text: "духота",             when: (w) => (w.tempMax ?? 0) >= HEAT_MIN && (RAIN.has(w.code) || (w.cloud ?? 0) >= 70) },
  { text: "пылища",             when: (w) => (w.tempMax ?? 0) >= HEAT_MIN },
  // Прохладный/умеренный дождь — тогда лужи и сырость.
  { text: "лужи везде",         when: (w) => RAIN.has(w.code) && (w.tempMax ?? 0) > 1 && (w.tempMax ?? 0) < HEAT_MIN },
  { text: "сырость",            when: (w) => (w.tempMax ?? 99) < HEAT_MIN && (RAIN.has(w.code) || FOG.has(w.code) || (w.cloud ?? 0) >= 85) },
  // Грязь — только когда льёт бóльшую часть дня (precip ≥ «весь день»-порога).
  { text: "грязища",            when: (w) => (RAIN.has(w.code) || SNOW.has(w.code)) && (w.precip ?? 0) >= ALLDAY_MM && (w.tempMax ?? 0) > 0 && (w.tempMax ?? 0) < HEAT_MIN },
  { text: "слякоть",            when: (w) => SNOW.has(w.code) && (w.tempMax ?? 0) >= 0 && (w.tempMax ?? 0) <= 4 },
  { text: "ледяной дождь",      when: (w) => FREEZING.has(w.code) },
  { text: "гололёд",            when: (w) => FREEZING.has(w.code) || ((w.tempMin ?? 99) <= 0 && (RAIN.has(w.code) || (w.precip ?? 0) > 0)) },
];

// Список доп-событий, реально допустимых при текущей погоде.
function extraEvents(w) {
  return EXTRA_EVENTS.filter((e) => e.when(w)).map((e) => e.text);
}

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

  // доп: только событие, реально допустимое при сегодняшней погоде.
  // При сильном ветре (≥40) — почти всегда про ветер; иначе изредка любое из подходящих.
  const extras = extraEvents(w);
  if (extras.length) {
    const stormWind = (w.wind ?? 0) >= 40;
    if ((stormWind && maybe(0.6)) || maybe(lvl >= 3 ? 0.25 : 0.1)) {
      const windEvents = extras.filter((e) => e.startsWith("ветер") || e === "ветрище");
      const choice = stormWind && windEvents.length ? pick(windEvents) : pick(extras);
      parts.push(`${pick(LINKS)} ${choice}`);
    }
  }

  let s = parts.join(" ");
  if (lvl >= 4) s = s.toUpperCase(); // капс только когда реально достало
  return `${s} ${EMOJI[cat]}`;
}

export { generateMessage, categoryKey, fmt, pick };
