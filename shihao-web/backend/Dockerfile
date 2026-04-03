FROM node:18-alpine as builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build:prod || true

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 4000
CMD [ "node", "src/index.js" ]
