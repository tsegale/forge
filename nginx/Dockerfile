# syntax=docker/dockerfile:1.7
# The edge server: builds the React app and serves it, and proxies /api to the API.
# Build context is the repository root (docker-compose.yml), so both frontend/ and nginx/ are visible.

# ---- build the frontend ----
FROM node:24-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- serve ----
FROM nginx:1.27-alpine
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf nginx/content-security-policy.conf nginx/api-proxy.conf /etc/nginx/snippets/
COPY --from=build /app/dist /usr/share/nginx/html
