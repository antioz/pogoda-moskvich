// Получение погоды по Москве из Open-Meteo (бесплатно, без API-ключа).

const MOSCOW = { lat: 55.7558, lon: 37.6173 };

const URL =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${MOSCOW.lat}&longitude=${MOSCOW.lon}` +
  `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
  `&current=temperature_2m,weather_code,cloud_cover` +
  `&timezone=Europe/Moscow&forecast_days=1`;

/**
 * @returns {Promise<{tempMax:number, tempMin:number, code:number, cloud:number,
 *   tempNow:number, precip:number, wind:number}>}
 */
async function getMoscowWeather() {
  const res = await fetch(URL);
  if (!res.ok) {
    throw new Error(`Open-Meteo вернул ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  return {
    tempMax: data.daily.temperature_2m_max[0],
    tempMin: data.daily.temperature_2m_min[0],
    code: data.daily.weather_code[0],
    cloud: data.current.cloud_cover,
    tempNow: data.current.temperature_2m,
    precip: data.daily.precipitation_sum[0],       // мм за день — для «весь день»
    wind: data.daily.wind_speed_10m_max[0],         // км/ч — для «ветрище»
  };
}

export { getMoscowWeather };
