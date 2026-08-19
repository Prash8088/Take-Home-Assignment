FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npx prisma generate && npm run build

RUN mkdir -p /app/uploads

COPY start.sh /app/start.sh

RUN chmod +x /app/start.sh

EXPOSE 3000

CMD ["/app/start.sh"]