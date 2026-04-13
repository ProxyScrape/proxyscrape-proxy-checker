# Stage 1: Build React
FROM node:20-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src/ ./src/
COPY public/ ./public/
COPY electron.vite.config.mjs ./
# Required for production renderer build (electron-vite validate)
ENV POSTHOG_KEY=build-placeholder
ENV POSTHOG_API_HOST=https://app.posthog.com
ENV POSTHOG_UI_HOST=https://app.posthog.com
ENV INTERCOM_APP_ID=build-placeholder
RUN npm run build:renderer

# Stage 2: Build Go binary with embedded SPA
FROM golang:1.21-alpine AS backend
WORKDIR /build
COPY backend/ ./
COPY --from=frontend /app/dist/renderer/ ./internal/api/web/
RUN CGO_ENABLED=0 go build -tags webserver -o checker ./cmd/checker

# Stage 3: Minimal runtime image
FROM gcr.io/distroless/static:nonroot
COPY --from=backend /build/checker /checker
EXPOSE 8080
ENTRYPOINT ["/checker"]
CMD ["serve", "--mode=server", "--port=8080", "--bind=0.0.0.0"]
