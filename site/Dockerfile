# The Crux consumer site (Next.js) for a hosted deploy such as Railway.
# Accounts and uploads live in .data/ (Node's built-in SQLite): mount a volume at /app/.data so they
# survive redeploys. NEXT_PUBLIC_CRUX_API is read at build time, so set it before building.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG NEXT_PUBLIC_CRUX_API
ENV NEXT_PUBLIC_CRUX_API=$NEXT_PUBLIC_CRUX_API \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "-c", "npx next start -p ${PORT:-3000}"]
