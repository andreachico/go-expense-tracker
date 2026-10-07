# syntax=docker/dockerfile:1

# ---------- Build stage ----------
# A full Go toolchain image used only to compile the binary. Nothing from this
# stage ships in the final image except the binary we copy out.
FROM golang:1.25 AS build
WORKDIR /src

# Copy just the module files first and download dependencies. Docker caches this
# layer, so dependencies are only re-downloaded when go.mod/go.sum change — not
# on every source edit.
COPY go.mod go.sum ./
RUN go mod download

# Now copy the source and build.
COPY . .

# CGO_ENABLED=0 produces a statically linked binary with no libc dependency, so
# it runs on a minimal base image. -ldflags "-s -w" strips debug info to shrink
# the binary; -trimpath removes local filesystem paths for reproducible builds.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server .

# ---------- Runtime stage ----------
# distroless "static" has no shell, package manager, or extra tools — just the
# minimum to run a static binary. Smaller image + much smaller attack surface.
# The :nonroot tag runs as an unprivileged user by default.
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /out/server /server

EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/server"]
