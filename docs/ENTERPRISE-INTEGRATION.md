> **This documentation is no longer maintained here.**
>
> For the latest version, please visit: **[CBrowser Enterprise Integration Guide](https://cbrowser.ai/docs/ENTERPRISE-INTEGRATION)**

---

# CBrowser Enterprise Integration Guide

This document explains how to integrate the private `cbrowser-enterprise` package with the public `cbrowser` package.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  cbrowser (public npm)                                      │
│  ├── IConstitutionalEnforcer (interface)                    │
│  ├── BaseConstitutionalEnforcer (abstract base class)       │
│  ├── NoOpConstitutionalEnforcer (fallback)                  │
│  └── getEnforcer() → dynamic loader                         │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ dynamic import (optional)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  cbrowser-enterprise (private npm/GitHub Packages)          │
│  ├── EnterpriseConstitutionalEnforcer                       │
│  │   ├── applyStealthMeasures() — real implementation       │
│  │   ├── persistAuditEntry() — database logging             │
│  │   └── Full fingerprint evasion suite                     │
│  └── exports { EnterpriseConstitutionalEnforcer, version }  │
└─────────────────────────────────────────────────────────────┘
```

## Enterprise Package Structure

Create a private repository `cbrowser-enterprise`:

```
cbrowser-enterprise/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Main exports
│   ├── enforcer.ts                 # EnterpriseConstitutionalEnforcer
│   ├── stealth/
│   │   ├── fingerprint.ts          # Browser fingerprint normalization
│   │   ├── webdriver.ts            # WebDriver flag patching
│   │   ├── timing.ts               # Human-like timing injection
│   │   └── canvas.ts               # Canvas/WebGL normalization
│   └── audit/
│       └── persistence.ts          # Audit log database
└── dist/                           # Compiled output
```

### package.json (Enterprise)

```json
{
  "name": "cbrowser-enterprise",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "private": true,
  "peerDependencies": {
    "cbrowser": ">=15.0.0"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

### src/index.ts (Enterprise)

```typescript
export { EnterpriseConstitutionalEnforcer } from "./enforcer.js";
export const version = "1.0.0";
```

### src/enforcer.ts (Enterprise Template)

```typescript
import {
  BaseConstitutionalEnforcer,
  type StealthConfig,
  type StealthAuditEntry,
} from "cbrowser";
import type { Page } from "playwright";

export class EnterpriseConstitutionalEnforcer extends BaseConstitutionalEnforcer {
  constructor(config?: Partial<StealthConfig>) {
    super(config);
  }

  /**
   * Persist audit entries to database
   */
  protected async persistAuditEntry(entry: StealthAuditEntry): Promise<void> {
    // TODO: Implement database persistence
    // - SQLite for local
    // - PostgreSQL for production
    console.log("[Enterprise] Audit:", JSON.stringify(entry));
  }

  /**
   * Apply stealth measures to page
   */
  async applyStealthMeasures(page: Page): Promise<void> {
    // 1. Patch navigator.webdriver
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
    });

    // 2. Inject realistic plugins
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "plugins", {
        get: () => [
          { name: "Chrome PDF Plugin" },
          { name: "Chrome PDF Viewer" },
          { name: "Native Client" },
        ],
      });
    });

    // 3. Patch chrome object
    await page.addInitScript(() => {
      (window as any).chrome = {
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
      };
    });

    // 4. Normalize WebGL fingerprint
    await this.normalizeWebGL(page);

    // 5. Add human-like mouse movement patterns
    // (Injected via persona's humanBehavior traits)
  }

  private async normalizeWebGL(page: Page): Promise<void> {
    await page.addInitScript(() => {
      const getParameterProxy = new Proxy(
        WebGLRenderingContext.prototype.getParameter,
        {
          apply(target, thisArg, args) {
            const param = args[0];
            // Normalize common fingerprint vectors
            if (param === 37445) return "Intel Inc."; // UNMASKED_VENDOR
            if (param === 37446) return "Intel Iris OpenGL Engine"; // UNMASKED_RENDERER
            return Reflect.apply(target, thisArg, args);
          },
        }
      );
      WebGLRenderingContext.prototype.getParameter = getParameterProxy;
    });
  }
}
```

## Publishing Enterprise Package

### Option 1: GitHub Packages (Recommended)

```bash
# In cbrowser-enterprise repo
npm login --registry=https://npm.pkg.github.com --scope=@yourorg
npm publish
```

### Option 2: Private npm Registry

```bash
# Using Verdaccio or npm Enterprise
npm publish --registry https://your-private-registry.com
```

### Option 3: Git Dependency

```json
{
  "dependencies": {
    "cbrowser-enterprise": "git+ssh://git@github.com:yourorg/cbrowser-enterprise.git"
  }
}
```

## Installing Enterprise for MCP Server

On your MCP server host:

```bash
# Install public package
npm install cbrowser

# Install enterprise (with auth)
npm install cbrowser-enterprise --registry https://npm.pkg.github.com

# Or with .npmrc
echo "@yourorg:registry=https://npm.pkg.github.com" >> .npmrc
echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" >> .npmrc
npm install @yourorg/cbrowser-enterprise
```

## Usage in MCP Server

The MCP server automatically detects enterprise:

```typescript
import { getEnforcer, printEnterpriseStatus } from "cbrowser";

// On startup
await printEnterpriseStatus();

// When creating browser with stealth
const enforcer = await getEnforcer({
  enabled: true,
  authorization: {
    authorizedDomains: ["*.yourdomain.com"],
  },
});

// Use enforcer with browser
const browser = new CBrowser({ enforcer });
```

## Verification

```bash
# Check if enterprise is detected
npx cbrowser status

# Output with enterprise:
# ╔══════════════════════════════════════════════════════════╗
# ║  CBrowser Enterprise: ACTIVE                             ║
# ║  Version: 1.0.0                                          ║
# ║  Stealth capabilities: ENABLED                           ║
# ╚══════════════════════════════════════════════════════════╝
```

## Security Notes

1. **Never commit enterprise to public repo** - It's a separate private package
2. **Use GitHub Packages or private npm** - Not public npm registry
3. **Rotate access tokens** - Use short-lived tokens for CI/CD
4. **Audit logs are immutable** - Cannot be disabled or cleared
5. **Rate limits enforced** - Minimum limits cannot be lowered
