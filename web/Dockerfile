# The engineering run viewer (Vite + React) as a static site, for a hosted deploy such as
# Railway. VITE_API_URL is read at build time: set it to the engine API's address.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM node:24-slim
RUN npm install -g serve@14.2.4 --no-audit --no-fund
WORKDIR /app
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]
