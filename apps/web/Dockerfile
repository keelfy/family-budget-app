FROM oven/bun:1 AS base

# Install dependencies and build
FROM base AS builder
WORKDIR /app

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Copy package configurations
COPY package.json turbo.json bun.lockb* ./
COPY apps/web/package.json ./apps/web/
# Copy the shared packages which are workspace dependencies
COPY packages ./packages

# Install dependencies
RUN bun install

# Copy application source
COPY apps/web ./apps/web

# Build the application
RUN cd apps/web && bun run build

# Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# The standalone output includes the workspace structure
# Copy the standalone directory contents to /app
COPY --from=builder /app/apps/web/.next/standalone ./
# Bun can resolve Next from /app/node_modules/next in some standalone layouts
COPY --from=builder /app/node_modules/next ./node_modules/next
# The static files are not copied to standalone by default, so we copy them manually
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
# Copy public directory for static assets
# COPY --from=builder /app/apps/web/public ./public
# COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# The entrypoint is the server.js file inside the standalone app directory
CMD ["sh", "-c", "if [ -f apps/web/server.js ]; then exec bun apps/web/server.js; elif [ -f server.js ]; then exec bun server.js; else echo 'server.js not found in expected locations'; ls -la; exit 1; fi"]
