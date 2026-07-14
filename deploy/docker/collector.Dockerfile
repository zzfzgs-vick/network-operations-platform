FROM golang:1.26.5-alpine AS build
WORKDIR /workspace
COPY go.mod ./
COPY services/collector services/collector
RUN CGO_ENABLED=0 go build -trimpath -o /out/collector ./services/collector/cmd/collector

FROM alpine:3.23.3 AS runtime
RUN addgroup -S collector && adduser -S -G collector collector
COPY --from=build /out/collector /usr/local/bin/collector
USER collector
STOPSIGNAL SIGTERM
ENTRYPOINT ["collector"]
