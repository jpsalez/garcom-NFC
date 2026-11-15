# Imagem de produção do front. NEXT_PUBLIC_API_URL é gravada no build:
#   docker build --build-arg NEXT_PUBLIC_API_URL=https://meudominio.com/api/v1 -t garcom-web front-end
FROM node:22-bookworm-slim

WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
