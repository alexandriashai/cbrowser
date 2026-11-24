/**
 * The pure half of sign-up while connecting (src/oauth-signup.ts): which
 * callbacks are accepted, client registration, the page's escaping, and the
 * order of the CMS calls. tests/oauth-signup-flow.test.ts runs the whole flow
 * through the real server.
 *
 * The callback rule is the security boundary. Before 2026-09-08 /authorize sent
 * a signed-in user's API key to any redirect_uri; the fix allowed only Claude's
 * two callbacks. Registration widens that to loopback addresses and nothing
 * else, so these properties pin both halves: every loopback form passes, and no
 * other host does, however it is dressed up.
 *
 * Pure: no browser, no server.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  authorizeErrorMessage,
  checkRedirect,
  decodeClientId,
  encodeClientId,
  isLoopbackRedirect,
  isRegistrableRedirect,
  oauthClientKey,
  registerOAuthClient,
  registerAccount,
  renderAuthorizePage,
  sendSignupCode,
  type OAuthParams,
} from "../src/oauth-signup.js";

const ALLOW = ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"];
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "[::1]"];
const KEY = oauthClientKey({ CMS_INTERNAL_SECRET: "test-secret" });
const OTHER_KEY = oauthClientKey({ CMS_INTERNAL_SECRET: "another-secret" });

describe("which callbacks may be registered", () => {
  test("every loopback callback, any port and path", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...LOOPBACK_HOSTS),
        fc.integer({ min: 1, max: 65535 }),
        fc.stringMatching(/^[a-z0-9/_-]{0,30}$/),
        (h, port, path) => isRegistrableRedirect(`http://${h}:${port}/${path}`, ALLOW),
      ),
      { numRuns: 1000 },
    );
  });

  test("Anti: no other host, including names built around a loopback one", () => {
    const evil = fc.oneof(
      fc.domain(),
      fc.constantFrom(
        "localhost.evil.test", "127.0.0.1.evil.test", "evil.test", "claude.ai.evil.test",
        "127.0.0.2", "0.0.0.0", "[::2]", "localhost.", "10.0.0.1", "192.168.1.1",
      ),
    );
    fc.assert(
      fc.property(evil, fc.integer({ min: 1, max: 65535 }), fc.constantFrom("http", "https"), (h, port, scheme) =>
        !isRegistrableRedirect(`${scheme}://${h}:${port}/callback`, ALLOW)),
      { numRuns: 1000 },
    );
  });

  test("Anti: loopback over https, with a user part, or with a fragment", () => {
    for (const uri of [
      "https://127.0.0.1:8080/callback",
      "http://evil.test@127.0.0.1/callback",
      "http://127.0.0.1@evil.test/callback",
      "http://127.0.0.1:8080/callback#x",
      "javascript:alert(1)",
      "",
      "not a url",
    ]) {
      expect(isLoopbackRedirect(uri), uri).toBe(false);
      expect(isRegistrableRedirect(uri, ALLOW), uri).toBe(false);
    }
  });
});

describe("which callbacks /authorize sends a code to", () => {
  const registered = (uris: string[], name?: string) => encodeClientId(name ? { u: uris, n: name } : { u: uris }, KEY);

  test("Claude's callbacks, exactly, with or without a registration", () => {
    expect(checkRedirect(ALLOW[0], "", ALLOW, KEY)).toEqual({ ok: true, loopback: false });
    expect(checkRedirect(`${ALLOW[0]}/x`, "", ALLOW, KEY).ok).toBe(false);
    expect(checkRedirect(`${ALLOW[0]}?x=1`, "", ALLOW, KEY).ok).toBe(false);
  });

  test("a loopback callback its client registered, on any port", () => {
    const id = registered(["http://localhost:1/callback"], "Claude Code");
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 65535 }), (port) => {
        const r = checkRedirect(`http://localhost:${port}/callback`, id, ALLOW, KEY);
        return r.ok && r.loopback && r.port === String(port) && r.clientName === "Claude Code";
      }),
      { numRuns: 500 },
    );
  });

  test("Anti: a loopback callback with no client_id, a made-up one, or another client's", () => {
    const uri = "http://127.0.0.1:43219/callback";
    const otherClient = registered(["http://127.0.0.1:1/other"]);
    const forged = `cbc_${Buffer.from(JSON.stringify({ u: [uri] })).toString("base64url")}.AAAA`;
    const otherKey = encodeClientId({ u: [uri] }, OTHER_KEY);
    for (const id of ["", "cbc_x", "claude", otherClient, forged, otherKey]) {
      expect(checkRedirect(uri, id, ALLOW, KEY).ok, id).toBe(false);
    }
  });

  test("Anti: a registered client cannot change the host or path, only the port", () => {
    const id = registered(["http://127.0.0.1:1/callback"]);
    for (const uri of ["http://localhost:2/callback", "http://[::1]:2/callback", "http://127.0.0.1:2/other", "http://127.0.0.1:2/callback?x=1"]) {
      expect(checkRedirect(uri, id, ALLOW, KEY).ok, uri).toBe(false);
    }
  });

  test("Anti: a tampered client_id does not decode", () => {
    const id = registered(["http://127.0.0.1:1/cb"]);
    const [body, mac] = id.slice(4).split(".");
    const tampered = `cbc_${Buffer.from(JSON.stringify({ u: ["http://127.0.0.1:1/cb", "http://127.0.0.1:1/evil"] })).toString("base64url")}.${mac}`;
    expect(decodeClientId(id, KEY)).toEqual({ u: ["http://127.0.0.1:1/cb"] });
    expect(decodeClientId(tampered, KEY)).toBeNull();
    expect(decodeClientId(`cbc_${body}.${mac}x`, KEY)).toBeNull();
  });

  test("the signing key follows the server secret, so registrations survive a restart", () => {
    expect(oauthClientKey({ CMS_INTERNAL_SECRET: "test-secret" }).equals(KEY)).toBe(true);
    expect(oauthClientKey({ OAUTH_CLIENT_KEY: "k", CMS_INTERNAL_SECRET: "test-secret" }).equals(KEY)).toBe(false);
  });
});

describe("client registration (RFC 7591)", () => {
  test("a client with loopback callbacks gets a signed client_id that registers them", () => {
    const r = registerOAuthClient(
      { client_name: "Claude Code", redirect_uris: ["http://localhost:33418/callback"], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"] },
      ALLOW,
      KEY,
      () => 1_700_000_000_000,
    );
    expect(r.status).toBe(201);
    expect(decodeClientId(String(r.body.client_id), KEY)).toEqual({ u: ["http://localhost:33418/callback"], n: "Claude Code" });
    expect(r.body.client_id_issued_at).toBe(1_700_000_000);
    expect(r.body.redirect_uris).toEqual(["http://localhost:33418/callback"]);
    expect(r.body.token_endpoint_auth_method).toBe("none");
    expect(r.body.grant_types).toEqual(["authorization_code"]);
  });

  test("a client asking for a secret or other grants is registered as a public PKCE client, not refused", () => {
    const r = registerOAuthClient({ redirect_uris: [ALLOW[0]], token_endpoint_auth_method: "client_secret_post", grant_types: ["client_credentials"] }, ALLOW, KEY);
    expect(r.status).toBe(201);
    expect(r.body.token_endpoint_auth_method).toBe("none");
    expect(r.body.grant_types).toEqual(["authorization_code"]);
  });

  test("Anti: any callback outside the rule refuses the whole registration", () => {
    const r = registerOAuthClient({ redirect_uris: ["http://localhost:1/cb", "https://evil.test/cb"] }, ALLOW, KEY);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("invalid_redirect_uri");
  });

  test("Anti: missing, malformed or too many callbacks, and non-objects, are refused", () => {
    for (const m of [
      { redirect_uris: [] },
      { redirect_uris: "http://localhost:1/cb" },
      { redirect_uris: Array.from({ length: 11 }, (_, i) => `http://localhost:${i + 1}/cb`) },
      { redirect_uris: [`http://localhost:1/${"a".repeat(600)}`] },
      null, "x", [], 42,
    ]) {
      expect(registerOAuthClient(m, ALLOW, KEY).status, JSON.stringify(m).slice(0, 80)).toBe(400);
    }
  });
});

describe("error messages", () => {
  test("only known codes print, and as fixed text", () => {
    expect(authorizeErrorMessage("invalid_login")).toBe("That email and password do not match.");
    for (const code of ["Your account is suspended. Call 555-0100.", "toString", "__proto__", "", null, undefined]) {
      expect(authorizeErrorMessage(code as string), String(code)).toBeUndefined();
    }
  });
});

describe("the /authorize page", () => {
  const oauth: OAuthParams = {
    redirectUri: 'http://localhost:1/cb?"><script>x</script>',
    state: "<s>",
    codeChallenge: "c",
    codeChallengeMethod: "S256",
    clientId: "cbc_1",
  };

  test("every value it prints is escaped", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), (email, name, error) => {
        for (const mode of ["signin", "signup-email", "signup-code"] as const) {
          const html = renderAuthorizePage({ mode, oauth, email: email + "<b>", name: name + "<i>", error: error + "<img>", localClient: { clientName: name + "<u>", port: "1" } });
          if (["<b>", "<i>", "<img>", "<u>", "<script>x"].some((t) => html.includes(t))) return false;
        }
        return true;
      }),
      { numRuns: 300 },
    );
  });

  test("each step posts its action and carries the OAuth parameters forward", () => {
    const steps = { signin: "signin", "signup-email": "send-code", "signup-code": "register" } as const;
    for (const [mode, action] of Object.entries(steps)) {
      const html = renderAuthorizePage({ mode: mode as keyof typeof steps, oauth, email: "a@b.test" });
      expect(html).toContain(`name="action" value="${action}"`);
      expect(html).toContain('name="code_challenge" value="c"');
      expect(html).toContain('name="state" value="&lt;s&gt;"');
    }
  });

  test("a loopback request says a program on this computer is asking, and its port", () => {
    const html = renderAuthorizePage({ mode: "signin", oauth, localClient: { clientName: "Claude Code", port: "43219" } });
    expect(html).toContain("A program on this computer (port 43219)");
    expect(html).toContain("Claude Code");
    expect(renderAuthorizePage({ mode: "signin", oauth })).not.toContain("A program on this computer");
  });

  test("sign-in links to sign-up and back, and the code step asks for a new password", () => {
    expect(renderAuthorizePage({ mode: "signin", oauth })).toContain("mode=signup");
    expect(renderAuthorizePage({ mode: "signup-email", oauth })).toContain("Sign in");
    const code = renderAuthorizePage({ mode: "signup-code", oauth, email: "a@b.test" });
    expect(code).toContain('autocomplete="one-time-code"');
    expect(code).toContain('autocomplete="new-password"');
    expect(code).toContain('minlength="8"');
  });
});

describe("the CMS calls", () => {
  type Call = { path: string; body: Record<string, unknown> };
  function fakeCms(answers: Record<string, Array<[number, unknown]>>) {
    const calls: Call[] = [];
    const doFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      calls.push({ path, body: JSON.parse(String(init?.body ?? "{}")) });
      const [status, body] = answers[path].shift()!;
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    return { calls, doFetch };
  }
  const input = { email: "a@b.test", code: "123456", name: "A", password: "longenough" };

  test("the code goes with the registration, and a current CMS needs nothing else", async () => {
    const { calls, doFetch } = fakeCms({ "/api/accounts/register": [[201, { apiKey: "cbk_new" }]] });
    expect(await registerAccount("http://cms", input, 1000, doFetch)).toEqual({ ok: true, apiKey: "cbk_new" });
    expect(calls).toEqual([{ path: "/api/accounts/register", body: { email: "a@b.test", password: "longenough", name: "A", code: "123456" } }]);
  });

  test("an older CMS that wants the email verified first: verify, then register again", async () => {
    const { calls, doFetch } = fakeCms({
      "/api/accounts/register": [[403, { error: "Email not verified" }], [201, { apiKey: "cbk_new" }]],
      "/api/accounts/verify-code": [[200, { verified: true }]],
    });
    expect(await registerAccount("http://cms", input, 1000, doFetch)).toEqual({ ok: true, apiKey: "cbk_new" });
    expect(calls.map((c) => c.path)).toEqual(["/api/accounts/register", "/api/accounts/verify-code", "/api/accounts/register"]);
    expect(calls[1].body).toEqual({ email: "a@b.test", code: "123456" });
  });

  test("a wrong code and a CMS refusal come back as messages, never as a key", async () => {
    const wrong = fakeCms({ "/api/accounts/register": [[403, {}]], "/api/accounts/verify-code": [[400, { error: "Invalid or expired verification code" }]] });
    expect(await registerAccount("http://cms", input, 1000, wrong.doFetch)).toEqual({ ok: false, message: "Invalid or expired verification code" });
    const weak = fakeCms({ "/api/accounts/register": [[400, { error: "Password must be at least 8 characters" }]] });
    expect(await registerAccount("http://cms", input, 1000, weak.doFetch)).toEqual({ ok: false, message: "Password must be at least 8 characters" });
    const noKey = fakeCms({ "/api/accounts/register": [[201, { apiKey: "not-a-key" }]] });
    expect((await registerAccount("http://cms", input, 1000, noKey.doFetch)).ok).toBe(false);
  });

  test("send-code: an existing account is told to sign in", async () => {
    const taken = fakeCms({ "/api/accounts/send-code": [[409, { error: "Email already registered" }]] });
    expect(await sendSignupCode("http://cms", "a@b.test", 1000, taken.doFetch)).toMatchObject({ ok: false, alreadyRegistered: true });
    const sent = fakeCms({ "/api/accounts/send-code": [[200, { success: true }]] });
    expect(await sendSignupCode("http://cms", "a@b.test", 1000, sent.doFetch)).toEqual({ ok: true });
  });
});
