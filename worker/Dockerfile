# NimBill webhook worker. Build from the project folder (it needs src/lib):
#   docker build -f worker/Dockerfile -t nimbill-worker .
# No port is exposed: the worker only makes outgoing connections.
# Bun installs the packages; the worker itself still runs on Node.
FROM oven/bun:1.4.5-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY src/lib ./src/lib
COPY worker ./worker

USER node
CMD ["node", "--conditions=react-server", "--import", "./worker/loader.mjs", "--experimental-strip-types", "--no-warnings", "worker/index.ts"]
