FROM node:22-bookworm-slim AS build

WORKDIR /app/backend
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app/backend

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist ./dist

RUN mkdir -p uploads && chown -R node:node /app/backend
USER node

EXPOSE 3001
CMD ["node", "dist/main.js"]
