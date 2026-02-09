FROM mcr.microsoft.com/playwright:v1.51.1-noble

LABEL org.opencontainers.image.source="https://github.com/alexandriashai/cbrowser"
LABEL org.opencontainers.image.description="CBrowser - Cognitive Browser automation for CI/CD pipelines"
LABEL org.opencontainers.image.licenses="BSL-1.1"
LABEL org.opencontainers.image.version="16.16.0"

RUN npm install -g cbrowser@latest

RUN mkdir -p /work

WORKDIR /work

# Multi-user safety: session-scoped screenshots with auto-cleanup
ENV CBROWSER_SCREENSHOT_RETENTION=1h

ENTRYPOINT ["npx", "cbrowser"]
