# Постоянный процесс бота для VPS. Состояние — на bind-mount /app/data.
FROM node:20-alpine
WORKDIR /app
# Зависимостей нет — копируем только код.
COPY package.json server.js bot.js ./
COPY src ./src
ENV NODE_ENV=production
CMD ["node", "server.js"]
