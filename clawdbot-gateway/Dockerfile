# Build stage - use Alpine to match runtime
FROM node:22-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    vips-dev \
    git

RUN corepack enable

WORKDIR /app

# Clone the repository
# HA add-on build context is only this folder, so we fetch the full source
ARG CLAWDBOT_VERSION=main
RUN git clone --depth 1 --branch ${CLAWDBOT_VERSION} \
    https://github.com/michaelhaessig/clawdbot.git .

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build
RUN pnpm build
RUN pnpm ui:install
RUN pnpm ui:build

# Prune dev dependencies
RUN pnpm prune --prod

# Runtime stage
ARG BUILD_FROM
FROM ${BUILD_FROM:-ghcr.io/home-assistant/aarch64-base:3.19}

# Install Node.js and runtime dependencies
RUN apk add --no-cache \
    nodejs \
    npm \
    vips \
    xxd \
    lsof \
    curl

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/ui/dist ./ui/dist

# Copy run script from add-on build context
COPY run.sh /run.sh
RUN chmod a+x /run.sh

ENV NODE_ENV=production

CMD ["/run.sh"]
