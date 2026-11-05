# One image for the API and the worker. The API also serves the built React app.
# Multi-arch: works on x86_64 and ARM (e.g. Oracle Cloud Ampere A1).

FROM node:22-slim AS deps
WORKDIR /app
# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
RUN cd backend && npx prisma generate
RUN npm run build -w frontend

FROM node:22-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    FRONTEND_DIST=/app/frontend/dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/backend ./backend
COPY --from=build /app/frontend/dist ./frontend/dist
WORKDIR /app/backend
USER node
EXPOSE 4000
# TypeScript runs through tsx (same code path as development; no separate build step to drift).
CMD ["node", "--import", "tsx", "src/api/server.ts"]
