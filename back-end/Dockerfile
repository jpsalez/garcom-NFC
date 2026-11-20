# Imagem de produção da API. Build na raiz do back-end: docker build -t garcom-api back-end
FROM node:22-bookworm-slim

# O Prisma precisa do OpenSSL e o sharp/SVG precisa de fontconfig + fonte padrão
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN mkdir -p /data/media && chown node:node /app /data/media
USER node

# Dependências completas: a API roda com tsx e as migrations usam o CLI do Prisma (ambos são devDependencies)
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.ts tsconfig.json ./
# O generate não conecta ao banco, só exige a variável definida
RUN DATABASE_URL=postgresql://build npx prisma generate
COPY --chown=node:node src ./src

ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=384" \
    MALLOC_ARENA_MAX=2
EXPOSE 4000
# Aplica as migrations pendentes e sobe a API sem wrapper extra do binário tsx
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node --import tsx src/main.ts"]
