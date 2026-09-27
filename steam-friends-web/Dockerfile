# The studio host's image. See DEPLOY-VPS.md.
#
# Three stages so the final image carries only what `next start` needs: the
# standalone server Next traces out of the build, plus the static assets it
# deliberately leaves behind. No compiler, no dev dependencies, no source.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Baked in at build time, not read at runtime: robots.txt and the sitemap are
# prerendered from it. Anything named NEXT_PUBLIC_* would be too — it is
# inlined into the browser bundle — which is why none are relied on here.
ARG APP_URL
ENV APP_URL=$APP_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    # Docker sets HOSTNAME to the container id, and Next's standalone server
    # binds to whatever HOSTNAME says. Left alone it would listen on an address
    # nothing else can reach, and every request from Caddy would be refused.
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
CMD ["node", "server.js"]
