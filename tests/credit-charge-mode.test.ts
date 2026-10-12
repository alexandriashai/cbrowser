/**
 * The enterprise server (:3100) charges no credits (Alexa, 2026-10-12). It starts the
 * shared remote server with `chargeCredits: false`, and every deduct call it makes then
 * carries `charge=none`, which the CMS prices at 0 while keeping its domain, tier and
 * URL gates. Every other server keeps charging.
 */
import { describe, test, expect, afterEach } from "bun:test";
import { deductQuery, setCreditChargeMode, chargedByDeduct } from "../src/mcp-server-remote.js";

afterEach(() => setCreditChargeMode("charge"));

describe("what counts as charged (the refund scope)", () => {
  // The CMS refund route credits the catalog price without finding the matching
  // deduct, so a call priced at 0 must never enter a charge scope: an isError there
  // would refund money that was never taken.
  test("a 0-credit deduct is not a charge", () => {
    expect(chargedByDeduct(true, { allowed: true, cost: 0 })).toBe(false);
  });
  test("a priced deduct is a charge", () => {
    expect(chargedByDeduct(true, { allowed: true, cost: 5 })).toBe(true);
  });
  test("a CMS that does not report cost keeps the old behaviour (charged)", () => {
    expect(chargedByDeduct(true, { allowed: true })).toBe(true);
  });
  test("a refusal or a non-2xx is never a charge", () => {
    expect(chargedByDeduct(true, { allowed: false, cost: 5 })).toBe(false);
    expect(chargedByDeduct(false, { allowed: true, cost: 5 })).toBe(false);
    expect(chargedByDeduct(true, {})).toBe(false);
  });
});

describe("deduct query", () => {
  test("default: no charge parameter, so the CMS charges the catalog price", () => {
    const q = new URLSearchParams(deductQuery("h", "empathy_audit", "https://example.org/"));
    expect(q.get("key_hash")).toBe("h");
    expect(q.get("tool")).toBe("empathy_audit");
    expect(q.get("target_url")).toBe("https://example.org/");
    expect(q.has("charge")).toBe(false);
  });

  test("charge mode none: every deduct carries charge=none", () => {
    setCreditChargeMode("none");
    const q = new URLSearchParams(deductQuery("h", "empathy_audit", "https://example.org/"));
    expect(q.get("charge")).toBe("none");
    expect(q.get("target_url")).toBe("https://example.org/");
  });

  test("no target URL: the parameter is left out, as before", () => {
    setCreditChargeMode("none");
    const q = new URLSearchParams(deductQuery("h", "navigate", undefined));
    expect(q.has("target_url")).toBe(false);
    expect(q.get("charge")).toBe("none");
  });
});
