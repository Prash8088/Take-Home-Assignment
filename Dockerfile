FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate && npm run build
RUN mkdir -p /app/uploads
EXPOSE 3000
CMD ["node","dist/server.js"]
