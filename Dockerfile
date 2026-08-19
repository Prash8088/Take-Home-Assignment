FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npx prisma generate && npm run build

RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["sh", "-c", "node dist/server.js & node dist/queue/analysis.worker.js & wait -n"]