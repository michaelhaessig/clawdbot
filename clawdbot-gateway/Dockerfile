# Build stage - use Debian to match runtime (glibc compatibility)
FROM node:22-bookworm-slim AS builder

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libvips-dev \
    git \
    curl \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install bun (required for build scripts)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

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

# Build hac CLI
RUN cd tools/hac && bun build src/index.ts --outfile=dist/index.js --target=node --minify

# Prune dev dependencies
RUN pnpm prune --prod

# Runtime stage
ARG BUILD_FROM
FROM ${BUILD_FROM:-ghcr.io/home-assistant/aarch64-base-debian:bookworm}

# Install runtime dependencies (NOT nodejs - we copy from builder for Node 22)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips42 \
    xxd \
    lsof \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy Node.js 22 from builder stage (Debian apt only has Node 18, we need 22 for regex /v flag)
COPY --from=builder /usr/local/bin/node /usr/local/bin/node
COPY --from=builder /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/ui/dist ./ui/dist

# Copy hac CLI and make it available in PATH
COPY --from=builder /app/tools/hac/dist/index.js /usr/local/bin/hac.js
RUN printf '#!/bin/sh\nexec node /usr/local/bin/hac.js "$@"\n' > /usr/local/bin/hac && chmod +x /usr/local/bin/hac

# Copy run script from add-on build context
COPY run.sh /run.sh
RUN chmod a+x /run.sh

ENV NODE_ENV=production

CMD ["/run.sh"]
