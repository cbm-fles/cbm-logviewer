FROM docker.io/library/node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

FROM docker.io/library/node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server --include-workspace-root=false \
  && npm cache clean --force
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
ENV LOGVIEWER_HOST=0.0.0.0 \
  LOGVIEWER_WEB_ROOT=/app/web/dist
EXPOSE 5602
USER node
CMD ["node", "server/dist/main.js"]
