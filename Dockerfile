# Production image for the Pinnacle lending platform (API + built web app).
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    SERVE_FRONTEND=true \
    DOCUMENT_STORAGE_DIR=/app/storage/documents \
    BACKUP_DIR=/app/storage/backups

# postgresql-client provides pg_dump for `npm run backup`.
RUN apk add --no-cache postgresql16-client
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./

# Documents must live on a persistent volume mounted here (see docker-compose.yml).
RUN mkdir -p /app/storage/documents /app/storage/backups && chown -R node:node /app/storage
USER node
VOLUME ["/app/storage"]
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1

CMD ["npm", "start"]
