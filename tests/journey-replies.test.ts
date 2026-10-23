/**
 * How a cognitive journey reads the model's reply at each step.
 *
 * 2026-10-23, a CLI journey on ucdenver.edu: 15 of 17 steps printed "the
 * model's reply could not be read". The live provider returned the text of
 * content[0] only, so a reply whose first block was not text read as "", and
 * the trace recorded empty decisions. The reader also gave up on anything but
 * one greedy {...} match. Now every text block is read, a reply without a JSON
 * object is asked for once more, and a step that is still unreadable says why.
 *
 * No model is called: the provider gets a fake client.
 * tests/journey-replies-browser.test.ts runs a whole journey on that path.
 */
import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { createLiveDecisionProvider, readReplyJson } from "../src/cognitive/index.js";
import { formatJourneyStep } from "../src/cognitive/journey-dialog.js";
import type { CognitiveStep } from "../src/cognitive/index.js";

const DECISION = { phase: "decide", monologue: "There's a Tuition link.", action: "click:Tuition", goalProgress: 0.2 };

describe("readReplyJson", () => {
  test("a bare JSON object", () => {
    expect(readReplyJson(JSON.stringify(DECISION)).value).toEqual(DECISION);
  });

  test("a fenced object", () => {
    expect(readReplyJson("```json\n" + JSON.stringify(DECISION) + "\n```").value).toEqual(DECISION);
  });

  test("prose after the object that holds a closing brace (the greedy match failed here)", () => {
    const reply = `${JSON.stringify(DECISION)}\n\nNote: I chose the link because it says "Tuition" }`;
    expect(readReplyJson(reply).value).toEqual(DECISION);
  });

  test("braces and escaped quotes inside strings", () => {
    const tricky = { monologue: 'It says "{ cost: TBD }" \\ and then }{', action: null };
    expect(readReplyJson(`Here you go: ${JSON.stringify(tricky)} done.`).value).toEqual(tricky);
  });

  test("an empty reply says there was no text", () => {
    expect(readReplyJson("   ")).toEqual({ problem: "the model returned no text" });
  });

  test("a reply cut off mid-object says it is not a JSON object and how it began", () => {
    const r = readReplyJson('{"phase": "comprehend", "monologue": "This page lists');
    expect(r.value).toBeUndefined();
    expect(r.problem).toContain("the reply was not a JSON object");
    expect(r.problem).toContain('it began: {"phase": "comprehend"');
  });

  test("for any object, wrapped in any prose without braces or fences, the object is what is read", () => {
    const prose = fc.string().filter((t) => !/[{}`]/.test(t));
    fc.assert(fc.property(fc.dictionary(fc.string(), fc.jsonValue()), prose, prose, (obj, before, after) => {
      const expected = JSON.parse(JSON.stringify(obj));
      expect(readReplyJson(`${before}${JSON.stringify(obj)}${after}`).value).toEqual(expected);
    }), { numRuns: 300 });
  });
});

type Block = { type: string; text?: string };
type Reply = { content: Block[]; stop_reason: string | null };

/** A client whose messages.create returns the given replies in order and records each request. */
function fakeClient(replies: Reply[]) {
  const requests: Array<{ max_tokens: number; messages: Array<{ role: string; content: unknown }> }> = [];
  const client = {
    messages: {
      create: async (params: { max_tokens: number; messages: Array<{ role: string; content: unknown }> }) => {
        requests.push(params);
        const next = replies.shift();
        if (!next) throw new Error("no more scripted replies");
        return next;
      },
    },
  };
  return { client: client as never, requests };
}

const CTX = { stepIndex: 2, systemPrompt: "system", messages: [{ role: "user" as const, content: "What next?" }] };

describe("the live decision provider", () => {
  test("reads the text after a non-text first block, in one call", async () => {
    const { client, requests } = fakeClient([
      { content: [{ type: "thinking" }, { type: "text", text: JSON.stringify(DECISION) }], stop_reason: "end_turn" },
    ]);
    const provider = createLiveDecisionProvider(client, "claude-test");
    expect(JSON.parse(await provider.decide(CTX as never))).toEqual(DECISION);
    expect(requests).toHaveLength(1);
    expect(provider.describeLastReply?.()).toBeUndefined();
  });

  test("joins a reply split over several text blocks", async () => {
    const json = JSON.stringify(DECISION);
    const { client } = fakeClient([
      { content: [{ type: "text", text: json.slice(0, 20) }, { type: "text", text: json.slice(20) }], stop_reason: "end_turn" },
    ]);
    expect(JSON.parse(await createLiveDecisionProvider(client, "m").decide(CTX as never))).toEqual(DECISION);
  });

  test("asks once more, for the JSON alone, when the reply holds none", async () => {
    const { client, requests } = fakeClient([
      { content: [{ type: "text", text: "I think I would click the Tuition link next." }], stop_reason: "end_turn" },
      { content: [{ type: "text", text: JSON.stringify(DECISION) }], stop_reason: "end_turn" },
    ]);
    const provider = createLiveDecisionProvider(client, "m");
    expect(JSON.parse(await provider.decide(CTX as never))).toEqual(DECISION);
    expect(requests).toHaveLength(2);
    const retry = requests[1].messages;
    expect(retry.slice(0, 1)).toEqual(CTX.messages);
    expect(retry[1]).toEqual({ role: "assistant", content: "I think I would click the Tuition link next." });
    expect(String(retry[2].content)).toContain("Reply again with only that JSON object");
    expect(requests.map((r) => r.max_tokens)).toEqual([2000, 2000]);
    expect(provider.describeLastReply?.()).toBeUndefined();
  });

  test("a reply cut off at max_tokens with only a thinking block is asked again with more room", async () => {
    const { client, requests } = fakeClient([
      { content: [{ type: "thinking", text: undefined }], stop_reason: "max_tokens" },
      { content: [{ type: "thinking" }, { type: "text", text: JSON.stringify(DECISION) }], stop_reason: "end_turn" },
    ]);
    const provider = createLiveDecisionProvider(client, "m");
    expect(JSON.parse(await provider.decide(CTX as never))).toEqual(DECISION);
    expect(requests.map((r) => r.max_tokens)).toEqual([2000, 8000]);
  });

  test("when both replies are unusable, it says why for each, with the stop reason", async () => {
    const { client, requests } = fakeClient([
      { content: [], stop_reason: "max_tokens" },
      { content: [{ type: "text", text: "Sorry, I can't tell." }], stop_reason: "end_turn" },
    ]);
    const provider = createLiveDecisionProvider(client, "m");
    expect(await provider.decide(CTX as never)).toBe("Sorry, I can't tell.");
    expect(requests).toHaveLength(2);
    expect(requests[1].messages[1]).toEqual({ role: "assistant", content: "(no text)" });
    expect(requests[1].max_tokens).toBe(8000);
    const why = provider.describeLastReply?.() ?? "";
    expect(why).toContain("the model returned no text (stop_reason max_tokens; content blocks: none)");
    expect(why).toContain("asked once more, and the reply was not a JSON object");
    expect(why).toContain("it began: Sorry, I can't tell.");
  });

  test("a readable step after an unreadable one clears the reason", async () => {
    const { client } = fakeClient([
      { content: [], stop_reason: "end_turn" },
      { content: [], stop_reason: "end_turn" },
      { content: [{ type: "text", text: JSON.stringify(DECISION) }], stop_reason: "end_turn" },
    ]);
    const provider = createLiveDecisionProvider(client, "m");
    await provider.decide(CTX as never);
    expect(provider.describeLastReply?.()).toContain("no text");
    await provider.decide(CTX as never);
    expect(provider.describeLastReply?.()).toBeUndefined();
  });
});

describe("an unreadable step names why", () => {
  const step = (over: Partial<CognitiveStep>): CognitiveStep => ({
    step: 4, phase: "evaluate", monologue: "", replyReadable: false,
    state: { currentMood: "neutral" } as CognitiveStep["state"], ...over,
  });

  test("with a reason", () => {
    expect(formatJourneyStep(step({ replyProblem: "the model returned no text (stop_reason max_tokens; content blocks: none)" }))).toEqual([
      "   Step 4: the model's reply could not be read (the model returned no text (stop_reason max_tokens; content blocks: none)), so this step took no action",
    ]);
  });

  test("without one, as before", () => {
    expect(formatJourneyStep(step({}))).toEqual([
      "   Step 4: the model's reply could not be read, so this step took no action",
    ]);
  });
});
