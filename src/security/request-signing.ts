/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * HMAC Request Signing for CBrowser MCP Server
 *
 * Provides request integrity verification and replay attack prevention.
 * Uses HMAC-SHA256 with timestamp and nonce validation.
 *
 * Usage:
 *   - Client signs: HMAC-SHA256(body + timestamp + nonce, secret)
 *   - Server validates signature, timestamp window, and nonce uniqueness
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

// Nonce tracking for replay prevention
// TTL: 10 minutes (covers 5-minute window + buffer)
const usedNonces = new Map<string, number>();
const NONCE_TTL_MS = 10 * 60 * 1000;
const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Cleanup interval
setInterval(() => {
  const now = Date.now();
  usedNonces.forEach((timestamp, nonce) => {
    if (now - timestamp > NONCE_TTL_MS) {
      usedNonces.delete(nonce);
    }
  });
}, 60 * 1000); // Every minute

export interface SignatureValidationResult {
  valid: boolean;
  reason?: string;
}

export interface RequestSigningConfig {
  /** Shared secret for HMAC signing (from env: MCP_SIGNING_SECRET) */
  secret: string;
  /** Whether signing is required (default: false - optional but recommended) */
  required: boolean;
}

/**
 * Get request signing configuration from environment
 */
export function getSigningConfig(): RequestSigningConfig | null {
  const secret = process.env.MCP_SIGNING_SECRET;
  if (!secret) {
    return null;
  }

  return {
    secret,
    required: process.env.MCP_SIGNING_REQUIRED === "true",
  };
}

/**
 * Create an HMAC signature for a request
 *
 * @param body - The request body (stringified JSON)
 * @param timestamp - Unix timestamp in milliseconds
 * @param nonce - Unique nonce for this request
 * @param secret - Shared secret key
 * @returns Hex-encoded HMAC-SHA256 signature
 */
export function createSignature(
  body: string,
  timestamp: number,
  nonce: string,
  secret: string
): string {
  const payload = `${body}.${timestamp}.${nonce}`;
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  return hmac.digest("hex");
}

/**
 * Validate request signature, timestamp, and nonce
 *
 * Headers required:
 *   - X-Signature: HMAC-SHA256 signature (hex)
 *   - X-Timestamp: Unix timestamp in milliseconds
 *   - X-Nonce: Unique nonce (UUID recommended)
 *
 * @param req - Incoming HTTP request
 * @param body - Raw request body string
 * @param config - Signing configuration
 * @returns Validation result with reason on failure
 */
export function validateSignature(
  req: IncomingMessage,
  body: string,
  config: RequestSigningConfig
): SignatureValidationResult {
  const signature = req.headers["x-signature"];
  const timestampHeader = req.headers["x-timestamp"];
  const nonce = req.headers["x-nonce"];

  // Check if signing headers are present
  if (!signature || !timestampHeader || !nonce) {
    if (config.required) {
      return {
        valid: false,
        reason: "Missing required signing headers (X-Signature, X-Timestamp, X-Nonce)",
      };
    }
    // Not required and no headers - skip validation
    return { valid: true };
  }

  // Normalize to strings
  const sig = Array.isArray(signature) ? signature[0] : signature;
  const ts = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;
  const n = Array.isArray(nonce) ? nonce[0] : nonce;

  // Validate timestamp format
  const timestamp = parseInt(ts, 10);
  if (isNaN(timestamp)) {
    return { valid: false, reason: "Invalid timestamp format" };
  }

  // Check timestamp is within window (prevent replay attacks)
  const now = Date.now();
  const age = Math.abs(now - timestamp);
  if (age > TIMESTAMP_WINDOW_MS) {
    return {
      valid: false,
      reason: `Timestamp outside allowed window (${Math.round(age / 1000)}s old, max ${TIMESTAMP_WINDOW_MS / 1000}s)`,
    };
  }

  // Check nonce hasn't been used (prevent replay attacks)
  if (usedNonces.has(n)) {
    return { valid: false, reason: "Nonce already used (replay detected)" };
  }

  // Compute expected signature
  const expectedSignature = createSignature(body, timestamp, n, config.secret);

  // Timing-safe comparison
  const sigBuffer = Buffer.from(sig, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (sigBuffer.length !== expectedBuffer.length) {
    return { valid: false, reason: "Invalid signature" };
  }

  if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, reason: "Invalid signature" };
  }

  // Mark nonce as used
  usedNonces.set(n, timestamp);

  return { valid: true };
}

/**
 * Client-side helper: Generate signing headers for a request
 *
 * @param body - Request body (will be JSON.stringify'd if not string)
 * @param secret - Shared secret key
 * @returns Headers object to include in request
 */
export function generateSigningHeaders(
  body: string | object,
  secret: string
): Record<string, string> {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  const timestamp = Date.now();
  const nonce = crypto.randomUUID();
  const signature = createSignature(bodyStr, timestamp, nonce, secret);

  return {
    "X-Signature": signature,
    "X-Timestamp": String(timestamp),
    "X-Nonce": nonce,
  };
}
