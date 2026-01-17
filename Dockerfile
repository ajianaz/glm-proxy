FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY src/ ./src/
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["bun", "src/index.ts"]
