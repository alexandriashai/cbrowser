# The base image must match the Playwright version cbrowser resolves (^1.64.1),
# or the browsers in the image are the wrong revisions for the library.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

LABEL org.opencontainers.image.source="https://github.com/alexandriashai/cbrowser"
LABEL org.opencontainers.image.description="CBrowser - Cognitive Browser automation for CI/CD pipelines"
LABEL org.opencontainers.image.licenses="MIT"

RUN npm install -g cbrowser@20

RUN mkdir -p /work

WORKDIR /work

# Multi-user safety: session-scoped screenshots with auto-cleanup
ENV CBROWSER_SCREENSHOT_RETENTION=1h

ENTRYPOINT ["npx", "cbrowser"]
