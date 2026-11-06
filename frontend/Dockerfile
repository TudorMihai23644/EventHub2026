# 1. build: Vite produce fișiere statice. Adresa API-ului intră în build (VITE_API_URL).
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=http://localhost:3000/api
ARG VITE_SENTRY_DSN=
ENV VITE_API_URL=$VITE_API_URL VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npm run build

# 2. servire: nginx, cu antetele de securitate din nginx/default.conf.template
FROM nginx:1.27-alpine
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# originea API-ului (pentru CSP) și a Sentry; se pot schimba la pornire, fără un build nou
ENV API_ORIGIN=http://localhost:3000 \
    SENTRY_ORIGINS="https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io"
EXPOSE 80
