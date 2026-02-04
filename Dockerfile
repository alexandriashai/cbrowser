FROM mcr.microsoft.com/playwright:v1.40.0-jammy

LABEL org.opencontainers.image.source="https://github.com/alexandriashai/cbrowser"
LABEL org.opencontainers.image.description="CBrowser - AI-powered browser automation for CI/CD pipelines"
LABEL org.opencontainers.image.licenses="MIT"

RUN npm install -g cbrowser

RUN mkdir -p /work

WORKDIR /work

ENTRYPOINT ["npx", "cbrowser"]
