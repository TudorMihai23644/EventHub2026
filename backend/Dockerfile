# Node 24 (LTS). Node 20 nu mai primește actualizări din aprilie 2026, iar SDK-ul resend cere Node >= 22.12.
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
# npm ci: exact versiunile din package-lock.json (build reproductibil), eșuează dacă lock-ul nu se potrivește
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# portul vine din PORT (implicit 5200, vezi src/common/urls.ts și docker-compose.yml)
EXPOSE 5200
CMD ["node", "dist/main"]
