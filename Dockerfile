FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1

CMD ["npm", "start"]
