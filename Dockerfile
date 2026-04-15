FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# --- Production image ---
FROM node:20-alpine

WORKDIR /app

# better-sqlite3 needs these
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DATABASE_URL=/app/data/digigold.db

EXPOSE 3000

CMD ["node", "dist/index.js"]
