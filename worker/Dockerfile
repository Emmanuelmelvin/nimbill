# NimBill webhook worker. Build from the project folder (it needs src/lib):
#   docker build -f worker/Dockerfile -t nimbill-worker .
# No port is exposed: the worker only makes outgoing connections.
FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY src/lib ./src/lib
COPY worker ./worker

USER node
CMD ["node", "--conditions=react-server", "--import", "./worker/loader.mjs", "--experimental-strip-types", "--no-warnings", "worker/index.ts"]
