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
# The static files are not copied to standalone by default, so we copy them manually
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
# Copy public directory for static assets
# COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# The entrypoint is the server.js file inside the standalone app directory
CMD ["bun", "apps/web/server.js"]
