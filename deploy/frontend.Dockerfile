FROM node:24-alpine AS build

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/write-runtime-config.sh /docker-entrypoint.d/40-neurocrop-runtime-config.sh
COPY --from=build /app/dist /usr/share/nginx/html
RUN chmod 755 /docker-entrypoint.d/40-neurocrop-runtime-config.sh

