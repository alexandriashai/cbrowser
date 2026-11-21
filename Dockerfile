# The base image supplies the OS libraries and browsers for one Playwright
# version. cbrowser@21 resolves its Playwright range (package.json) when the
# image builds, which can be newer than the base, so the install step below adds
# the browser revisions that Playwright needs, with that same Playwright, never
# npx (scripts/install-browsers.cjs). tests/dockerfiles.test.ts keeps the base
# inside the range and the major on the current release.
FROM mcr.microsoft.com/playwright:v1.65.1-noble

LABEL org.opencontainers.image.source="https://github.com/alexandriashai/cbrowser"
LABEL org.opencontainers.image.description="CBrowser - Cognitive Browser automation for CI/CD pipelines"
LABEL org.opencontainers.image.licenses="MIT"

RUN npm install -g cbrowser@21 \
    && node "$(npm root -g)/cbrowser/scripts/install-browsers.cjs" chromium

RUN mkdir -p /work

WORKDIR /work

# Multi-user safety: session-scoped screenshots with auto-cleanup
ENV CBROWSER_SCREENSHOT_RETENTION=1h

ENTRYPOINT ["npx", "cbrowser"]
