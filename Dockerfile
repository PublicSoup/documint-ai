# DocuMint AI — Railway image.
#
# Single-stage on purpose: the in-container executor (src/lib/executor) runs
# user/agent code with child_process, so the RUNTIME image must carry the
# language toolchains — a slim runner wouldn't have them. Optimise to multi-stage
# later if image size matters (see plans/railway-migration.md).

FROM node:24-bookworm

# --- Language runtimes for the in-container executor -------------------------
# Node ships in the base image. Python is the most common non-JS target; enable
# Go / PHP / JDK / Rust below as your product actually offers them (each adds
# real image weight, so keep this list to what you run).
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python-is-python3 \
        git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# python-is-python3 provides the `python` command the IDE command planner invokes
# (src/lib/ide/sandbox-runtime.ts uses `python`, not `python3`).
# Optional extra languages — uncomment to enable:
#   golang-go        # Go   (getSandboxCommandPlan "go")
#   php-cli          # PHP  (getSandboxCommandPlan "php")
#   default-jdk      # Java (getSandboxCommandPlan "java")
# Rust needs rustup (heavy); install separately if you offer it.

WORKDIR /app

# Install dependencies first so the layer caches across source-only changes.
COPY package.json package-lock.json ./
RUN npm ci

# App source (node_modules/.next/.env* are excluded via .dockerignore).
COPY . .

# --- Build-time environment --------------------------------------------------
# Two reasons the build needs env values:
#   1. NEXT_PUBLIC_* are INLINED into the client bundle by `next build`, so they
#      must be the REAL values here.
#   2. src/lib/env.ts validates required vars at module load, and Next evaluates
#      modules during the build — so those vars must be *present* (real values
#      are re-read at runtime from Railway).
# Railway supplies real values for every ARG below from the service's variables;
# the defaults only keep a bare local `docker build` working. Secrets are passed
# to `next build` inline (below) and never promoted to ENV, so they are not
# baked into the final image.
# Only NEXT_PUBLIC_* are declared as ARGs. They are inlined into the CLIENT
# bundle by `next build`, so they must be the REAL values — Railway supplies them
# as build args — and they are public by definition, so it's fine that they
# appear in build output. Server secrets are deliberately NOT declared as ARGs,
# so Railway can't inject their real values into the build (which would print
# them in the build logs).
ARG NEXT_PUBLIC_APP_URL="https://documintai.dev"
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_replace_me"
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=""
ARG NEXT_PUBLIC_DEV_PRO="false"

# prisma generate never touches the database — safe without real credentials.
RUN npx prisma generate

# `next build`. src/lib/env.ts validates required server vars at module load, so
# they must be PRESENT during the build — but the build never uses their real
# values (no page hits the DB/Stripe at build; verified). So every server secret
# is a harmless PLACEHOLDER here, keeping real secrets OUT of the build logs; the
# real values are injected into the running container at runtime. ensure-ai-schema
# is NOT run here (needs a live DB); it runs at container start instead.
RUN NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_APP_URL="$NEXT_PUBLIC_APP_URL" \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
    NEXT_PUBLIC_DEV_PRO="$NEXT_PUBLIC_DEV_PRO" \
    DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    NEXTAUTH_SECRET="build_time_placeholder_secret_min_32_chars_0" \
    STRIPE_SECRET_KEY="sk_build_placeholder" \
    STRIPE_WEBHOOK_SECRET="whsec_build_placeholder" \
    STRIPE_PRICE_ID_STARTER="price_build_placeholder" \
    STRIPE_PRICE_ID_PRO="price_build_placeholder" \
    STRIPE_PRICE_ID_TEAM="price_build_placeholder" \
    npx next build

# --- Runtime -----------------------------------------------------------------
# Run as an unprivileged user so executor child processes inherit an
# unprivileged identity (defense in depth on top of the secret-free child env).
RUN useradd -m -u 10001 appuser && chown -R appuser:appuser /app
USER appuser

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000

# Just serve. next start reads the port from $PORT (Railway sets it), so no -p
# flag — Railway's startCommand runs without shell expansion, and a literal
# "${PORT:-3000}" would reach next as an invalid --port argument.
# Do NOT run ensure-ai-schema here: at boot it contends for table locks with the
# still-live old deploy during zero-downtime cutover and hangs the container
# before next start binds. Run schema migrations as a separate step instead.
CMD ["sh", "-c", "npx next start -H 0.0.0.0"]
