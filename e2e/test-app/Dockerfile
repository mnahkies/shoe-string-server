FROM docker.io/library/node@sha256:729cbbdccbbac8f9354c9ddaed8cfa6fe5ec893dca12ea52e9c13b4b76f7282b

RUN groupadd --gid 2000 app \
    && useradd --uid 2000 --gid 2000 --create-home --shell /bin/bash app

WORKDIR /app
COPY server.mjs /app/server.mjs

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "/app/server.mjs"]
