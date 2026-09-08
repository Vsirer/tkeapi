

# USE_PREBUILT=0 容器内编译；=1 用根目录 Linux ELF。JOBS/CACHE 由 compose/脚本注入。

ARG DOCKER_IMAGE_PREFIX=""
ARG USE_PREBUILT=0
ARG ENABLE_CARGO_CACHE=1
ARG CARGO_BUILD_JOBS=1

FROM ${DOCKER_IMAGE_PREFIX}rust:slim-bookworm AS build-deps
ARG CARGO_BUILD_JOBS=1
ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse \
    CARGO_INCREMENTAL=0 \
    RUSTC_WRAPPER="" \
    RUSTFLAGS="-C link-arg=-Wl,--no-keep-memory"
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev make g++ perl ca-certificates clang \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app
COPY backend ./backend
# site_portal.rs / site_portal_pro.rs include_str! 编译期绑定的前端资源（缺一即构建失败）
COPY frontend/src/pages/Plugins/SitePortal/locales/portal \
     ./frontend/src/pages/Plugins/SitePortal/locales/portal
COPY frontend/src/pages/Plugins/SitePortal/whats-token-homepage.html \
     ./frontend/src/pages/Plugins/SitePortal/whats-token-homepage.html
COPY frontend/src/pages/Plugins/SitePortalPro/locales/portal \
     ./frontend/src/pages/Plugins/SitePortalPro/locales/portal
COPY frontend/src/pages/Plugins/SitePortalPro/whats-token-homepage.html \
     ./frontend/src/pages/Plugins/SitePortalPro/whats-token-homepage.html
WORKDIR /usr/src/app/backend

# 无 cache：交叉架构（QEMU）更稳，避免 mount + qemu segfault
FROM build-deps AS build-plain
ARG CARGO_BUILD_JOBS=1
RUN cargo build --release -j "${CARGO_BUILD_JOBS:-1}" \
    && cp -f target/release/tokensbyte-server /tokensbyte-server

# 有 cache：同架构重复构建更快
FROM build-deps AS build-cached
ARG CARGO_BUILD_JOBS=1
ARG TARGETARCH
RUN --mount=type=cache,id=tb-cargo-reg-${TARGETARCH},target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,id=tb-cargo-git-${TARGETARCH},target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,id=tb-cargo-tgt-${TARGETARCH},target=/usr/src/app/backend/target,sharing=locked \
    cargo build --release -j "${CARGO_BUILD_JOBS:-1}" \
    && cp -f target/release/tokensbyte-server /tokensbyte-server

FROM build-plain AS src-0
FROM build-cached AS src-1
FROM src-${ENABLE_CARGO_CACHE} AS build-from-source

FROM ${DOCKER_IMAGE_PREFIX}debian:bookworm-slim AS build-from-prebuilt
# 架构校验由导出脚本完成；此处只 COPY，避免 apt 拖慢 Mac 预编译打包
COPY tokensbyte-server-bin /tokensbyte-server
RUN chmod +x /tokensbyte-server

FROM build-from-source AS binary-0
FROM build-from-prebuilt AS binary-1
ARG USE_PREBUILT=0
FROM binary-${USE_PREBUILT} AS binary

FROM ${DOCKER_IMAGE_PREFIX}debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 libsqlite3-0 ca-certificates postgresql-client wget \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=binary /tokensbyte-server /app/tokensbyte-server
RUN mkdir -p /app/data
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["/app/tokensbyte-server"]
