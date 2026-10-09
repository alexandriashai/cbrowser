/**
 * The red-zone keyword list covers high-impact actions on named objects, not only on an account: destroying a
 * repository or project, moving money out, revoking access, deploying to production, signing out everywhere.
 * Each pattern has negative cases for the benign phrase nearest to it, because every pattern now applies to
 * every address form of an element (19.1.8's element-level gate), so a false red costs a forced retry everywhere.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-redlist-data-"));
process.env.CBROWSER_ARTIFACT_DIR ??= mkdtempSync(join(tmpdir(), "cb-redlist-art-"));
const { CBrowser } = await import("../src/browser.js");
const b = new CBrowser({ headless: true }) as unknown as { classifyAction(a: string, t: string, o?: { ignoreBlack?: boolean }): string };
const zone = (s: string) => b.classifyAction("click", s, { ignoreBlack: true });

const RED = [
  "Delete repository", "Delete this repository", "Delete my-app project", "Delete project", "Delete workspace",
  "Delete organization", "Delete user", "Delete team", "Destroy instance", "Drop database", "Remove repository",
  "Delete everything", "Delete all files", "Wipe device", "Wipe all data", "Factory reset", "Reset to factory settings",
  "Empty trash", "Empty the recycle bin", "Terminate instance", "Terminate server", "Cancel subscription",
  "Cancel my membership", "End subscription", "Cancel plan", "Revoke access", "Revoke all sessions", "Revoke API keys",
  "Suspend user", "Ban member", "Transfer funds", "Transfer ownership", "Withdraw funds", "Send money", "Send payment",
  "Wire money", "Refund order", "Issue refund", "Merge pull request", "Merge this branch", "Deploy to production",
  "Deploy main to prod", "Sign out everywhere", "Sign out of all devices", "Log out of all sessions",
  "Disable two-factor authentication", "Disable 2FA", "Leave organization", "Leave this workspace",
  // a form path read verb-first: "/projects/12/delete" -> "delete 12 projects"
  "delete 12 projects",
];
const NOT_RED = [
  "Delete draft", "Delete message", "Delete filter", "Remove filter", "Remove from cart", "Remove tag",
  "Remove project from favorites", "Remove team from the list from view", "Reset password", "Reset filters",
  "Sign out", "Log out", "Sign out of this device", "Leave a review", "Leave comment", "Cancel", "Send message",
  "Send invite", "Send feedback", "Send payment reminder", "Send payment link", "Merge cells", "Deploy preview",
  "Deploy", "Empty cart", "Subscription settings", "Project settings", "View repository", "Create project",
  "New workspace", "Transfer to another page", "Withdraw application", "Archive", "Clear search", "Terms of service",
  "Team members", "Invite members", "Payment methods", "Payment history",
];

describe("high-impact actions on named objects are red", () => {
  for (const s of RED) test(`red: ${s}`, () => { expect(zone(s)).toBe("red"); });
});
describe("their nearest benign phrases are not red", () => {
  for (const s of NOT_RED) test(`not red: ${s}`, () => { expect(zone(s)).not.toBe("red"); });
});
