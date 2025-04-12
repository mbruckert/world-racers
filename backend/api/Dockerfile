FROM lukemathwalker/cargo-chef:latest-rust-1.86 AS chef
WORKDIR /app

FROM chef AS planner
COPY api/Cargo.toml /app/api/Cargo.toml
COPY entity/Cargo.toml /app/entity/Cargo.toml
COPY migration/Cargo.toml /app/migration/Cargo.toml
COPY auth/Cargo.toml /app/auth/Cargo.toml

# Create fake lib.rs file
RUN mkdir -p /app/api/src/
RUN touch /app/api/src/lib.rs

WORKDIR /app/api
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/api/recipe.json /app/api/recipe.json

COPY api /app/api
COPY entity /app/entity
COPY migration /app/migration
COPY auth /app/auth
WORKDIR /app/api

# Build dependencies - this is the caching Docker layer!
RUN cargo chef cook --release --recipe-path recipe.json
# Build application

RUN cargo build --release --bin api

# We do not need the Rust toolchain to run the binary!
FROM gcr.io/distroless/cc-debian12 AS runtime
WORKDIR /app
COPY --from=builder /app/api/target/release/api /app/api

# Run as non-root user for security
USER nonroot:nonroot

ENTRYPOINT ["/app/api"] 