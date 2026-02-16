# CBrowser Threat Model

> **Document Version:** 1.0.0
> **Last Updated:** February 2026
> **Status:** Published

This document describes the threat model for CBrowser, a cognitive browser automation tool with constitutional AI safety. It identifies assets, trust boundaries, threat actors, attack vectors, mitigations, and residual risks.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Trust Boundaries](#trust-boundaries)
3. [Assets](#assets)
4. [Threat Actors](#threat-actors)
5. [Attack Vectors & Mitigations](#attack-vectors--mitigations)
6. [Residual Risks](#residual-risks)
7. [Security Architecture Diagram](#security-architecture-diagram)

---

## System Overview

CBrowser is an AI-powered browser automation tool that exposes browser control via the Model Context Protocol (MCP). It can be used:

1. **Locally** - As a CLI tool or stdio MCP server
2. **Remotely** - As an HTTP MCP server for Claude.ai custom connectors
3. **Enterprise** - With additional stealth and security features

### Core Components

| Component | Description | Risk Level |
|-----------|-------------|------------|
| **Browser Engine** | Puppeteer-controlled Chromium | High |
| **MCP Server** | HTTP/SSE server accepting AI commands | High |
| **Credential Store** | Encrypted storage for site credentials | Critical |
| **Session Manager** | Browser session persistence | Medium |
| **Audit Logger** | Immutable action history | Low |
| **Constitutional Enforcer** | Action classification and blocking | Critical |

---

## Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL (Untrusted)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │   AI Model  │  │  User Input │  │  Web Pages  │                  │
│  │  (Claude)   │  │  (Prompts)  │  │  (Content)  │                  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │
└─────────┼────────────────┼────────────────┼─────────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BOUNDARY 1: Authentication                        │
│                   (OAuth 2.1 / API Key / HMAC)                       │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BOUNDARY 2: Rate Limiting                         │
│              (Burst protection, per-session tracking)                │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                BOUNDARY 3: Constitutional Enforcement                │
│                    (Action Zone Classification)                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  🟢 GREEN    │  🟡 YELLOW   │  🔴 RED      │  ⬛ BLACK       │   │
│  │  Auto-exec   │  Log+proceed │  Verify      │  Never execute  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      INTERNAL (Protected)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │   Browser   │  │ Credentials │  │  Sessions   │                  │
│  │   Engine    │  │   (Encrypted)│  │   (Local)   │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Assets

### Critical Assets

| Asset | Description | CIA Impact |
|-------|-------------|------------|
| **Stored Credentials** | Site usernames/passwords in encrypted store | C: Critical, I: Critical, A: High |
| **Browser Sessions** | Authenticated sessions with cookies/tokens | C: Critical, I: High, A: Medium |
| **Constitutional Rules** | Action classification definitions | C: Low, I: Critical, A: High |
| **Audit Logs** | Immutable record of all actions | C: Medium, I: Critical, A: Medium |

### Sensitive Assets

| Asset | Description | CIA Impact |
|-------|-------------|------------|
| **API Keys** | Server authentication tokens | C: High, I: High, A: High |
| **OAuth Tokens** | Auth0 JWT tokens | C: High, I: High, A: Medium |
| **Signing Secrets** | HMAC shared secrets | C: High, I: High, A: Medium |
| **Screenshots** | Visual captures of pages | C: Medium, I: Low, A: Low |

---

## Threat Actors

### 1. Malicious Prompt Injector

**Profile:** External attacker crafting inputs to manipulate the AI into performing unauthorized actions.

**Motivation:** Data theft, unauthorized transactions, privilege escalation.

**Capabilities:**
- Craft prompts that trick AI into ignoring safety constraints
- Embed hidden instructions in web page content
- Social engineering through conversation context

### 2. Compromised AI Model

**Profile:** The AI model itself, if compromised or hallucinating, acting outside intended boundaries.

**Motivation:** N/A (emergent behavior, not intentional)

**Capabilities:**
- Issue any command the MCP protocol allows
- Attempt to bypass constitutional zones
- Chain multiple low-risk actions into high-risk outcomes

### 3. Network Attacker

**Profile:** External attacker with network access to the MCP server.

**Motivation:** Unauthorized access, data exfiltration, DoS.

**Capabilities:**
- Replay captured requests
- Man-in-the-middle attacks (if TLS misconfigured)
- Brute force authentication
- Resource exhaustion

### 4. Insider Threat

**Profile:** Developer or operator with legitimate access to CBrowser infrastructure.

**Motivation:** Data theft, sabotage, credential harvesting.

**Capabilities:**
- Access to signing secrets
- Ability to modify constitutional rules
- Direct access to credential store

---

## Attack Vectors & Mitigations

### AV-1: Prompt Injection

| Aspect | Details |
|--------|---------|
| **Vector** | Malicious content in AI prompts or web pages |
| **Target** | Constitutional enforcement bypass |
| **Impact** | Unauthorized actions (purchases, data access) |
| **Likelihood** | High |
| **Mitigations** | |
| | ✅ Four-zone action classification (GREEN/YELLOW/RED/BLACK) |
| | ✅ Immutable prohibited actions list |
| | ✅ Action-level audit logging |
| | ✅ Zone classification happens in code, not AI |
| **Residual Risk** | Novel attack patterns may bypass classification |

### AV-2: Credential Theft

| Aspect | Details |
|--------|---------|
| **Vector** | Extraction of stored credentials |
| **Target** | Credential store |
| **Impact** | Full account compromise |
| **Likelihood** | Medium |
| **Mitigations** | |
| | ✅ Encrypted credential storage |
| | ✅ Credentials never logged or exposed in output |
| | ✅ No tool exposes raw credentials |
| | ✅ Audit trail for credential usage |
| **Residual Risk** | Memory extraction attacks, key compromise |

### AV-3: Privilege Escalation via Zone Bypass

| Aspect | Details |
|--------|---------|
| **Vector** | Manipulating AI to reclassify actions |
| **Target** | Constitutional enforcer |
| **Impact** | BLACK zone actions executed |
| **Likelihood** | Low |
| **Mitigations** | |
| | ✅ Zone classification in compiled code |
| | ✅ No runtime zone modification API |
| | ✅ AI cannot influence classification |
| **Residual Risk** | Code vulnerabilities in enforcer |

### AV-4: Replay Attacks

| Aspect | Details |
|--------|---------|
| **Vector** | Capturing and resubmitting signed requests |
| **Target** | Authenticated endpoints |
| **Impact** | Duplicate action execution |
| **Likelihood** | Medium |
| **Mitigations** | |
| | ✅ HMAC request signing with timestamp |
| | ✅ 5-minute timestamp window |
| | ✅ Nonce tracking (10-minute TTL) |
| | ✅ Timing-safe signature comparison |
| **Residual Risk** | Attacks within 5-minute window |

### AV-5: Data Exfiltration

| Aspect | Details |
|--------|---------|
| **Vector** | AI commanded to scrape and leak data |
| **Target** | Sensitive page content |
| **Impact** | Data breach |
| **Likelihood** | Medium |
| **Mitigations** | |
| | ✅ Rate limiting with burst protection |
| | ✅ Per-session request tracking |
| | ✅ Audit logging of all reads |
| | ⚠️ Domain restrictions (not enforced by default) |
| **Residual Risk** | Slow exfiltration over time |

### AV-6: Denial of Service

| Aspect | Details |
|--------|---------|
| **Vector** | Resource exhaustion attacks |
| **Target** | MCP server availability |
| **Impact** | Service unavailable |
| **Likelihood** | Medium |
| **Mitigations** | |
| | ✅ IP-based rate limiting |
| | ✅ Burst protection |
| | ✅ Whitelist for trusted clients |
| | ✅ Session-based tracking |
| **Residual Risk** | Distributed attacks from many IPs |

### AV-7: Man-in-the-Middle

| Aspect | Details |
|--------|---------|
| **Vector** | Intercepting client-server communication |
| **Target** | API keys, OAuth tokens, commands |
| **Impact** | Credential theft, command injection |
| **Likelihood** | Low (if TLS enforced) |
| **Mitigations** | |
| | ✅ HSTS header (max-age 1 year) |
| | ✅ TLS required for production |
| | ⚠️ mTLS support (optional) |
| **Residual Risk** | Initial connection before HSTS |

---

## Residual Risks

These risks are acknowledged but not fully mitigated:

| Risk | Description | Acceptance Rationale |
|------|-------------|---------------------|
| **Novel Prompt Injection** | New attack patterns not covered by current classification | Zone system provides defense-in-depth; continuous monitoring |
| **Memory Extraction** | Side-channel attacks extracting secrets | Requires local access; out of scope for remote threat model |
| **Sophisticated Chaining** | Combining many safe actions into unsafe outcome | Audit logging enables detection; rate limiting slows attacks |
| **Zero-Day in Browser** | Vulnerabilities in Chromium | Using maintained Playwright; auto-updates |
| **Insider Key Compromise** | Legitimate user leaks signing secret | Operational security; key rotation procedures |

---

## Security Architecture Diagram

```
                                 ┌─────────────────┐
                                 │   AI Client     │
                                 │  (Claude.ai)    │
                                 └────────┬────────┘
                                          │
                                   HTTPS + Auth
                                          │
                    ┌─────────────────────▼─────────────────────┐
                    │              MCP SERVER                    │
                    │  ┌────────────────────────────────────┐   │
                    │  │         Security Layer             │   │
                    │  │  ┌─────────┐  ┌─────────┐         │   │
                    │  │  │  HSTS   │  │  CORS   │         │   │
                    │  │  └─────────┘  └─────────┘         │   │
                    │  │  ┌─────────┐  ┌─────────┐         │   │
                    │  │  │ X-Frame │  │ X-XSS   │         │   │
                    │  │  │ -Options│  │-Protect │         │   │
                    │  │  └─────────┘  └─────────┘         │   │
                    │  └────────────────────────────────────┘   │
                    │                    │                      │
                    │  ┌─────────────────▼──────────────────┐   │
                    │  │         Authentication              │   │
                    │  │  ┌──────────┐  ┌──────────┐        │   │
                    │  │  │OAuth 2.1 │  │ API Key  │        │   │
                    │  │  └──────────┘  └──────────┘        │   │
                    │  │  ┌──────────┐                      │   │
                    │  │  │HMAC Sign │ (optional)           │   │
                    │  │  └──────────┘                      │   │
                    │  └────────────────────────────────────┘   │
                    │                    │                      │
                    │  ┌─────────────────▼──────────────────┐   │
                    │  │         Rate Limiting               │   │
                    │  │  • Per-session tracking             │   │
                    │  │  • Burst protection                 │   │
                    │  │  • IP whitelist                     │   │
                    │  └────────────────────────────────────┘   │
                    │                    │                      │
                    │  ┌─────────────────▼──────────────────┐   │
                    │  │    Constitutional Enforcer          │   │
                    │  │  ┌──────┐┌──────┐┌──────┐┌──────┐  │   │
                    │  │  │GREEN ││YELLOW││ RED  ││BLACK │  │   │
                    │  │  │ Auto ││ Log  ││Verify││Block │  │   │
                    │  │  └──────┘└──────┘└──────┘└──────┘  │   │
                    │  └────────────────────────────────────┘   │
                    │                    │                      │
                    │  ┌─────────────────▼──────────────────┐   │
                    │  │         Browser Engine              │   │
                    │  │     (Puppeteer + Chromium)          │   │
                    │  └────────────────────────────────────┘   │
                    │                    │                      │
                    │  ┌─────────────────▼──────────────────┐   │
                    │  │         Audit Logger                │   │
                    │  │     (Immutable action history)      │   │
                    │  └────────────────────────────────────┘   │
                    └───────────────────────────────────────────┘
```

---

## Recommendations for Operators

1. **Always use HTTPS** - Never expose the MCP server over plain HTTP
2. **Enable authentication** - Set `MCP_API_KEY` or configure Auth0
3. **Enable rate limiting** - Set `RATE_LIMIT_ENABLED=true`
4. **Use request signing** - Set `MCP_SIGNING_SECRET` for integrity verification
5. **Monitor audit logs** - Review `~/.cbrowser/audit/` regularly
6. **Rotate credentials** - Update API keys and signing secrets periodically
7. **Restrict network access** - Use firewall rules to limit MCP server exposure

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Feb 2026 | Initial threat model |

---

*This threat model is maintained as part of CBrowser's security posture. Report security issues via the process described in [SECURITY.md](./SECURITY.md).*
