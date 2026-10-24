/**
 * MCP Apps UI resources.
 *
 * MCP Apps lets a server return HTML that the host renders inline in the chat
 * rather than as a collapsed tool result. The mechanism is a `ui://` resource
 * served as `text/html;profile=mcp-app`, linked from a tool through
 * `_meta.ui.resourceUri`.
 *
 * Whether a given host actually renders it is a separate question from whether
 * the protocol negotiates: modelcontextprotocol/ext-apps#671 reports the full
 * handshake succeeding on claude.ai while the frontend still shows only the text
 * fallback, and it has been open since May 2026 with no maintainer response. So
 * this ships as a static probe first. If it renders, the capture player follows
 * through the same channel; if it does not, no hydration layer was built against
 * a surface that was never going to display.
 *
 * Registered from every server variant rather than one, because the servers the
 * hosted connectors actually run (demo, enterprise) are separate entrypoints from
 * mcp-server-remote, and a resource registered only in the latter is invisible to
 * both of them.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildWidget, widgetUri, MCP_APP_MIME as KIT_MIME, type WidgetSpec } from "./widget-kit.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { scopedAccountId } from "../persona-scope.js";
import { MODEL_PROVENANCE } from "../visual/model-provenance.js";

/**
 * The level of the percentile interval cognitive_effort reports, in percent,
 * read from the registry (ctcReference.interval.level) so the view's words
 * cannot name a different level than the verdict's. Read directly, not
 * through param(): building a spec is not part of any answer's provenance.
 */
const CTC_INTERVAL_LEVEL = Math.round(MODEL_PROVENANCE["ctcReference.interval.level"].value * 100);

export const UI_PROBE_URI = "ui://cbrowser/probe";
export const CAPTURE_UI_PREFIX = "ui://cbrowser/capture/";

/**
 * Built player HTML, keyed by capture slug.
 *
 * The host reads a ui:// resource in a request separate from the tool call, so
 * the resource handler cannot know which capture is being asked about from the
 * call itself -- the slug in the URI is the only link between them. Hence a
 * store, and hence a per-capture URI rather than one fixed template URI.
 *
 * Bounded because these hold hundreds of KB of embedded frames each and a
 * long-lived server would otherwise accumulate every capture it ever ran.
 *
 * Keyed by the publishing account as well as the slug. The store is one map
 * for the whole hosted process, and it was keyed by slug alone: resources/list
 * enumerated every account's players and resources/read served any slug to
 * any caller, and a caller-chosen capture name could overwrite another
 * account's entry. An entry is now visible only to the account scope that
 * published it; unscoped callers (CLI, stdio, local) share the unscoped
 * partition exactly as before. (tenant, 2026-10-10)
 */
const CAPTURE_HTML_LIMIT = 24;
const captureHtml = new Map<string, { slug: string; html: string; accountId: number | undefined }>();

/** Store key: the account partition, then the slug. "-" is the unscoped partition. */
function captureKey(slug: string, accountId: number | undefined): string {
  return `${accountId ?? "-"}/${slug}`;
}

/** Store a built player and return the resource URI that will serve it. */
export function publishCaptureUi(slug: string, html: string): string {
  const accountId = scopedAccountId();
  captureHtml.set(captureKey(slug, accountId), { slug, html, accountId });
  while (captureHtml.size > CAPTURE_HTML_LIMIT) {
    const oldest = captureHtml.keys().next().value;
    if (oldest === undefined) break;
    captureHtml.delete(oldest);
  }
  return `${CAPTURE_UI_PREFIX}${slug}`;
}
export const MCP_APP_MIME = KIT_MIME;

const PROBE_HTML = `<!doctype html><meta charset="utf-8">
<style>
  :root{color-scheme:light dark}
  body{font:15px/1.55 ui-sans-serif,system-ui,sans-serif;margin:0;padding:18px}
  .card{border:1px solid rgba(128,128,128,.35);border-radius:10px;padding:16px}
  h1{font-size:1rem;margin:0 0 .5rem}
  code{font-family:ui-monospace,monospace;font-size:.85em}
  .ok{color:#1a7f4b;font-weight:600}
  .note{color:#666;font-size:.86rem;margin-top:.8rem}
</style>
<div class="card">
  <h1>CBrowser inline UI probe</h1>
  <p><span class="ok">This rendered as HTML.</span> MCP Apps UI resources display for
  this connector, so the capture player can be delivered the same way instead of as a link.</p>
  <p class="note">Served as <code>text/html;profile=mcp-app</code> from <code>ui://cbrowser/probe</code>.</p>
  <hr style="border:0;border-top:1px solid rgba(128,128,128,.3);margin:14px 0">
  <p><strong>data: URI image test</strong> &mdash; a green bar should appear below.</p>
  <img id="swatch" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAAoCAIAAAC6iKlyAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAo0lEQVR4nO3UQW0EARTD0MExlAxqqZdAr918VU8KAsvx836y9+8hPCi/X1EN6IDuP72N0QHdXENGNwcnHd2cRgd0cw0Z3RycdHRzGh3QzTVkdHNw0tHNaXRAN9eQ0c3BSUc3p9EB3VxDRjcHJx3dnEYHdHMNGd0cnHR0cxod0M01ZHRzcNLRzWl0QDfXkNHNwUlHN6fRAd1cQ0Y3BycdzZn+uh+XmLPx0sfXOwAAAABJRU5ErkJggg==" alt="data URI test swatch" width="120" height="40"
       style="border-radius:4px;display:block">
  <p class="note" id="verdict">If the bar is missing, this sandbox's CSP blocks
  <code>data:</code> in <code>img-src</code>, and capture frames need another channel.</p>
  <script>
    // The capture player embeds frames as data: URIs -- nothing is fetched from an
    // origin, because per-capture data cannot come from a static CDN and the
    // sandbox allowlist does not include cbrowser.ai. Whether that works hinges
    // entirely on img-src permitting data:, so the probe reports it rather than
    // leaving it to be discovered after a player is built on the assumption.
    var img = document.getElementById("swatch");
    img.addEventListener("load", function () {
      document.getElementById("verdict").textContent =
        "data: URIs render here (" + img.naturalWidth + "x" + img.naturalHeight +
        "). Capture frames can be embedded inline.";
    });
    img.addEventListener("error", function () {
      document.getElementById("verdict").textContent =
        "data: URI was BLOCKED by CSP. Capture frames need another channel.";
    });
  </script>
</div>`;

/**
 * Servers that already have these resources.
 *
 * The call site is genuinely ambiguous: startRemoteMcpServer registers them for
 * every server it builds, and the demo/enterprise entrypoints also need to
 * register them because they are separate builds. Whichever one you delete, the
 * other layer is wrong for some variant -- so registration is idempotent instead.
 * The SDK throws on a duplicate URI, which crash-loops the process at boot.
 */
const registered = new WeakSet<McpServer>();

/**
 * Render a status payload as a panel.
 *
 * Deliberately the first UI resource shipped, because it needs no subresources
 * at all -- counts, versions, config strings. That isolates the ui:// delivery
 * path (resource rides in the tool result, host injects, iframe renders) from
 * the separate question of what the sandbox CSP will fetch. One unknown at a
 * time; the capture player stacks two.
 *
 * The JSON block it accompanies is never replaced. status is read by the model
 * at least as often as by a person, and it is read to diff numbers -- a tool
 * that returned only a panel would leave the model able to report that a widget
 * appeared and nothing else.
 */
/**
 * The status view, as a spec rather than a template.
 *
 * This is the shape every other view now takes: name the fields, name the
 * blocks, and let the kit supply chrome, hydration, theming and safety. What
 * used to be 400 lines of markup and CSS per tool is the object below.
 */
export const STATUS_SPEC: WidgetSpec = {
  id: "status",
  // The docs page, not the /tools/ marketing route. Every tool has a docs page
  // -- 128 of them, generated from the wiki, with When to Use / Parameters /
  // Example / Tips -- whereas only six tools have a /tools/ page and the SPA
  // answers 200 with the homepage for the rest, so a link there would look
  // like it worked and silently land somewhere else. (2026-07-31)
  toolPage: "https://cbrowser.ai/docs/tool-status/",
  title: "Status",
  hero: {
    variant: "gradient",
    subtitle: { field: "version" },
    health: {
      checks: [
        { field: "browsers", flag: "installed", failLabel: "browser not installed", nameKey: "name" },
        { field: "directories", flag: "exists", failLabel: "missing directory", nameKey: "name" },
      ],
    },
    facts: [
      { field: "toolCount", label: "tools" },
      { field: "browsers", label: "browsers", countFlag: "installed", attnWhenShort: true },
      { field: "directories", label: "directories", countFlag: "exists", attnWhenShort: true },
      { field: "sessions", label: "sessions" },
      { field: "healCache.totalHeals", label: "self-heals" },
    ],
  },
  blocks: [
    {
      type: "drawer",
      title: "Details",
      blocks: [
        { type: "kv", title: "Configuration", field: "config" },
        { type: "kv", title: "Self-healing cache", field: "healCache" },
        { type: "table", title: "Directories", field: "directories" },
        { type: "table", title: "Browsers", field: "browsers" },
        { type: "rest", title: "Counts and paths" },
      ],
    },
  ],
  footer: { label: "Data directory:", field: "dataDir" },
};

/**
 * Persona view: the three trait sections as the account editor draws them,
 * each on its own colour ramp so the section is readable without the heading.
 */
export const PERSONA_SPEC: WidgetSpec = {
  id: "persona",
  toolPage: "https://cbrowser.ai/docs/tool-persona-lookup/",
  title: "Persona",
  // The name leads when there is one; "Persona" is the fallback for a payload
  // that has not named itself.
  titleField: "name",
  hero: {
    variant: "gradient",
    subtitle: { field: "description" },
    actions: [
      { label: "Customize this persona", url: "https://cbrowser.ai/account/personas" },
    ],
    facts: [
      { field: "traits", label: "traits" },
      { field: "values", label: "values" },
      { field: "accessibility_traits", label: "accessibility" },
    ],
  },
  blocks: [
    // Editable. The sandbox has no network of its own, but callServerTool
    // reaches the server that rendered this -- the same channel the image
    // blocks already use -- so the sliders write straight back through
    // persona_update rather than asking the reader to copy numbers into a
    // separate tool call. (2026-08-01)
    // Each meter section opens with where its numbers come from: a
    // built-in's are set by hand and registered as hypotheses, a custom
    // persona's by its author. Both were drawn as bare numbers. (21.0)
    { type: "editor", title: "Cognitive traits", field: "traits", personaField: "name", ramp: "trait", describe: true,
      provenanceField: "traitProvenance" },
    { type: "traits", title: "Values", field: "values", ramp: "value" },
    { type: "traits", title: "Accessibility traits", field: "accessibility_traits", ramp: "accessibility", describe: true,
      provenanceField: "accessibilityProvenance" },
    {
      type: "drawer",
      title: "Details",
      blocks: [
        { type: "kv", title: "Demographics", field: "demographics" },
        { type: "rest", title: "Other fields" },
      ],
    },
  ],
};

/**
 * One interactive surface for persona CRUD.
 *
 * The roster, the selected persona's editable traits, save and delete, in a
 * single view. Reads ship with the tool result so switching personas costs no
 * round trip; writes go back through persona_update and persona_delete, which
 * already handle both stores, the built-in guard and the description-drift
 * check. This is a surface over those tools, not a second copy of them --
 * nine duplicate tool families in this subsystem are what a second copy costs.
 * (2026-08-01)
 */
export const PERSONA_MANAGER_SPEC: WidgetSpec = {
  id: "persona-manager",
  toolPage: "https://cbrowser.ai/docs/tool-persona-manager/",
  title: "Personas",
  hero: {
    variant: "gradient",
    subtitle: { field: "summary" },
    facts: [
      { field: "personas", label: "personas" },
      { field: "editable", label: "editable" },
    ],
    actions: [{ label: "Manage on cbrowser.ai", url: "https://cbrowser.ai/account/personas" }],
  },
  blocks: [
    { type: "manager", title: "Personas", field: "personas" },
    { type: "note", title: "Creating a persona", field: "createHint" },
  ],
};

/**
 * A persona that was just created.
 *
 * The creation tools returned JSON and nothing else, so "what did I just make?"
 * meant reading a trait map by eye. This shows the finished persona the way the
 * lookup widget does, plus the two things only creation knows: which route
 * produced the values, and which traits the caller declared the description
 * could not support.
 *
 * Those declared-unsupported traits are the point. They sit at a population
 * baseline and are indistinguishable from considered values in every later
 * view; naming them at the moment of creation is the only place the
 * distinction is free. (2026-08-01)
 */
export const PERSONA_CREATED_SPEC: WidgetSpec = {
  id: "persona-created",
  toolPage: "https://cbrowser.ai/docs/tool-persona-create-from-description/",
  title: "Persona created",
  titleField: "persona_name",
  titlePrefix: "Created: ",
  hero: {
    variant: "gradient",
    subtitle: { field: "description" },
    facts: [
      { field: "traits", label: "traits" },
      { field: "valuesRoute", label: "values route" },
      { field: "unsupportedTraits", label: "unsupported" },
    ],
    actions: [{ label: "Manage personas", url: "https://cbrowser.ai/account/personas" }],
  },
  blocks: [
    { type: "note", title: "What the trait vector says", field: "traitSummary" },
    { type: "traits", title: "Cognitive traits", field: "traits", ramp: "trait", describe: true },
    { type: "traits", title: "Values", field: "values", ramp: "value" },
    { type: "table", title: "Declared unsupported", field: "unsupportedDetail" },
    {
      type: "drawer",
      title: "Details",
      blocks: [
        { type: "kv", title: "Values route", field: "valuesDerivation" },
        { type: "kv", title: "Demographics", field: "demographics" },
        { type: "rest", title: "Other fields" },
      ],
    },
  ],
};

/**
 * What an update changed.
 *
 * A diff rather than a snapshot, because the question after an edit is not
 * "what is this persona" but "what did I just do to it" — and the second is not
 * answerable from the first without having memorised the before.
 *
 * Carries the description-drift check: traits are updated and prose is not, so
 * a persona ends up with a vector saying "impatient" under a description that
 * still says "patient". The prose is never rewritten here; the contradiction is
 * reported and the decision left alone. (2026-08-01)
 */
export const PERSONA_UPDATED_SPEC: WidgetSpec = {
  id: "persona-updated",
  toolPage: "https://cbrowser.ai/docs/tool-persona-update/",
  title: "Persona updated",
  titleField: "persona",
  titlePrefix: "Updated: ",
  hero: {
    variant: "gradient",
    subtitle: { field: "note" },
    facts: [
      { field: "changed", label: "fields changed" },
      { field: "descriptionDrift", label: "description conflicts" },
    ],
    actions: [{ label: "Manage personas", url: "https://cbrowser.ai/account/personas" }],
  },
  blocks: [
    { type: "table", title: "What changed", field: "changes" },
    { type: "table", title: "Description now contradicts the traits", field: "descriptionDrift" },
    { type: "note", title: "What the trait vector says now", field: "traitSummary" },
    { type: "kv", title: "Where the write landed", field: "stores" },
    {
      type: "drawer",
      title: "Details",
      blocks: [
        { type: "traits", title: "Traits after update", field: "traits", ramp: "trait", describe: true },
        { type: "rest", title: "Other fields" },
      ],
    },
  ],
};

/**
 * Attention heatmap view.
 *
 * The image is the finding here -- a JSON list of scores is a lossy
 * description of where a persona actually looks. It is fetched through
 * artifact_fetch rather than embedded or linked: the result cannot carry it
 * past the host's size cap, and the sandbox will not load cbrowser.ai.
 */
/**
 * How a perceptual profile was found (perceptual-transport.ts:
 * PerceptualResolution), as a hero chip and as a sentence. Shared by both
 * attention views so the two say it the same way.
 */
const PERCEPTUAL_FACT: Record<string, string> = {
  builtin: "built-in: {name}",
  synthesized: "synthesized from traits",
  inferred: "borrowed: {name}",
  default: "none (neutral default)",
  "*": "{resolution}: {name}",
};
const PERCEPTUAL_SENTENCE: Record<string, string> = {
  builtin: "Drawn through the built-in perceptual filter for {name}. Its settings are set by hand and registered as hypotheses (perceptual.{name}.*); the count above covers how a filter is applied, not these settings.",
  synthesized: "Drawn through a filter synthesized from {name}'s own accessibility traits. The rules that turn traits into filter settings are not registered yet, so nothing here says where those numbers come from.",
  inferred: "This persona has no perceptual filter of its own. Its name matched the built-in {name}, so the map was drawn through that persona's filter, whose settings are set by hand (hypotheses, perceptual.{name}.*).",
  default: "No perceptual filter matched this persona, so the map used the neutral default: it filters nothing and models no one (its settings are registered as definitions).",
  "*": "Perceptual filter: {name} ({resolution}).",
};

export const ATTENTION_SPEC: WidgetSpec = {
  id: "attention",
  toolPage: "https://cbrowser.ai/docs/tool-attention-analysis/",
  title: "Attention",
  // Field names taken from a real tool result rather than assumed. The first
  // pass guessed topElements/elementsAnalyzed/url; the payload actually carries
  // topAttentionAreas, attentionQuality and no url at all, so every block was
  // pointed at a field that did not exist.
  titleField: "persona",
  hero: {
    variant: "gradient",
    subtitle: { field: "attentionReasoning" },
    facts: [
      { field: "topAttentionAreas", label: "areas" },
      { field: "attentionQuality", label: "quality" },
      { field: "alignmentScore", label: "alignment" },
      { field: "concentration", label: "concentration" },
      // Which filter drew the map, and how it was found: a name nothing
      // matched used to look exactly like a modelled persona.
      { field: "perceptualProfile", label: "perceptual filter", by: "resolution", templates: PERCEPTUAL_FACT },
    ],
  },
  blocks: [
    {
      type: "image",
      title: "Predicted attention",
      fetchTool: "artifact_fetch",
      fetchArgs: { file: "heatmapFile" },
      caption: "heatmapNote",
      emptyNote: "No heatmap in this result: the call passed heatmap: false, so no picture was made. Run attention_analysis again without heatmap: false to see where attention lands.",
    },
    // What the map rests on, beside the map; the full block is a drawer.
    { type: "provenance", field: "attentionProvenance", variant: "line", subject: "map", seeAlso: "What this map rests on" },
    { type: "note", title: "Perceptual filter", field: "perceptualProfile", by: "resolution", templates: PERCEPTUAL_SENTENCE },
    { type: "table", title: "Where attention lands", field: "topAttentionAreas" },
    { type: "drawer", title: "What this map rests on", blocks: [
      { type: "provenance", title: "Where each number comes from", field: "attentionProvenance", variant: "full", subject: "map", open: true },
    ] },
    {
      type: "drawer",
      title: "Details",
      blocks: [{ type: "rest", title: "All fields" }],
    },
  ],
};

/**
 * Attention compare: the two personas' maps differenced, each persona's
 * perceptual filter, and what the maps rest on. attention_compare returned
 * JSON only, so neither filter nor the block reached a reader. (21.0)
 */
export const ATTENTION_COMPARE_SPEC: WidgetSpec = {
  id: "attention-compare",
  toolPage: "https://cbrowser.ai/docs/tool-attention-compare/",
  title: "Attention compare",
  hero: {
    variant: "gradient",
    subtitle: { field: "interpretation" },
    facts: [
      { field: "attentionDivergence", label: "divergence (0-2)" },
      { field: "personaA.perceptualProfile", label: "filter, persona A", by: "resolution", templates: PERCEPTUAL_FACT },
      { field: "personaB.perceptualProfile", label: "filter, persona B", by: "resolution", templates: PERCEPTUAL_FACT },
    ],
  },
  blocks: [
    {
      type: "image",
      title: "Where they look differently",
      fetchTool: "artifact_fetch",
      fetchArgs: { file: "comparisonHeatmapFile" },
      caption: "heatmapNote",
      emptyNote: "No comparison map in this result: it was not drawn or could not be saved, so there is no picture to fetch.",
    },
    { type: "provenance", field: "attentionProvenance", variant: "line", subject: "comparison", seeAlso: "What these maps rest on" },
    { type: "kv", title: "Persona A", field: "personaA" },
    { type: "note", title: "Persona A's perceptual filter", field: "personaA.perceptualProfile", by: "resolution", templates: PERCEPTUAL_SENTENCE },
    { type: "kv", title: "Persona B", field: "personaB" },
    { type: "note", title: "Persona B's perceptual filter", field: "personaB.perceptualProfile", by: "resolution", templates: PERCEPTUAL_SENTENCE },
    // Named columns: bbox is an object, and a cell can only say which fields
    // it has. Five, so the table fits a 393px panel at its natural width;
    // seven wrapped the coordinates digit by digit.
    { type: "table", title: "Regions that differ most", field: "divergentRegions",
      columns: ["direction", "x", "y", "cellCount", "divergence"] },
    { type: "drawer", title: "What these maps rest on", blocks: [
      { type: "provenance", title: "Where each number comes from", field: "attentionProvenance", variant: "full", subject: "comparison", open: true },
    ] },
    { type: "drawer", title: "Details", blocks: [{ type: "rest", title: "All fields" }] },
  ],
};

/**
 * Screenshot view.
 *
 * The image is the whole result here, so the view is mostly frame: the shot
 * at full width, then the handful of facts that say what it is a picture of.
 * Fetched through artifact_fetch rather than read from the result, because a
 * compressed screenshot measured 144,731 base64 characters against a ~150k
 * cap -- it fits today and stops fitting on a denser page, and a view that
 * works until the page gets busy is worse than one that never did.
 */
export const SCREENSHOT_SPEC: WidgetSpec = {
  id: "screenshot",
  toolPage: "https://cbrowser.ai/docs/tool-screenshot/",
  title: "Screenshot",
  titleField: "url",
  hero: {
    variant: "gradient",
    subtitle: { field: "title" },
    facts: [
      { field: "viewport", label: "viewport" },
      { field: "viewport_forced", label: "forced to" },
      { field: "fullPage", label: "full page" },
    ],
  },
  blocks: [
    {
      type: "image",
      title: "",
      fetchTool: "artifact_fetch",
      fetchArgs: { file: "screenshotFile" },
      caption: "_screenshotNote",
    },
    {
      type: "drawer",
      title: "Details",
      blocks: [{ type: "rest", title: "All fields" }],
    },
  ],
  footer: { label: "Saved:", field: "screenshot" },
};

/**
 * Trait lookup view.
 *
 * The five levels are the answer: what a reader wants from "patience at 0.30"
 * is where that sits relative to the other four bands and what it means
 * behaviourally, which a JSON array of level objects does not convey.
 *
 * Bands use the same red-to-green ramp as the persona meters, so 0.30 reads
 * identically in both views rather than being one colour here and another
 * there.
 */
export const TRAIT_SPEC: WidgetSpec = {
  // Served under a URI the host has never seen.
  //
  // The bisect proved the tool side is fine: pointed at ui://cbrowser/status
  // it renders. So the fault is specific to this resource, which parses,
  // registers and renders locally under test. The remaining explanation is a
  // cached negative for the URI -- the host was told to render
  // ui://cbrowser/trait while the resource had not yet deployed, and kept the
  // failure. A fresh URI cannot have a stale entry.
  id: "trait-v2",
  toolPage: "https://cbrowser.ai/docs/tool-persona-trait-lookup/",
  title: "Trait",
  titleField: "trait",
  hero: {
    variant: "gradient",
    subtitle: { field: "description" },
    facts: [
      { field: "value", label: "value" },
      { field: "label", label: "level" },
    ],
  },
  blocks: [
    {
      type: "levels",
      title: "Where this value sits",
      field: "allLevels",
      valueField: "value",
      labelField: "label",
      behaviorsField: "behaviors",
    },
    // The source names what the scale means. Titled "Research basis" under
    // the bands, it read as backing for the bands and for the value; the
    // sentence under it says what it does and does not cover. (21.0)
    { type: "note", title: "Scale source", field: "researchBasis" },
    { type: "note", title: "What the source covers", field: "scaleProvenance" },
    {
      type: "drawer",
      title: "Built-in personas on this scale",
      blocks: [{ type: "table", title: "Each built-in value and its status", field: "builtinValues",
        columns: ["persona", "value", "status", "basis", "citation"] }],
    },
    {
      type: "drawer",
      title: "Every level",
      blocks: [{ type: "table", title: "Levels", field: "allLevels" }],
    },
  ],
};

/**
 * Bug hunt view. Field names read from a real run, not assumed:
 * bugs[] carries type, severity, description, url, selector, recommendation.
 */
export const BUGS_SPEC: WidgetSpec = {
  id: "bugs",
  toolPage: "https://cbrowser.ai/docs/tool-hunt-bugs/",
  title: "Bug hunt",
  hero: {
    variant: "gradient",
    // No subtitle. duration is milliseconds, and rendered as a bare subtitle it
    // read as "8563" under the title with nothing saying what it counted.
    facts: [
      // Distinct findings, not raw DOM occurrences: a carousel repeating five
      // broken images across duplicated slides read as ten. The occurrence
      // count is still in Run info for anyone who wants it.
      { field: "distinctBugs", label: "bugs" },
      { field: "pagesVisited", label: "pages crawled" },
      { field: "duration", label: "ms" },
    ],
  },
  blocks: [
    // Grouped by page. A flat list across a multi-page crawl says nothing
    // about which page a finding belongs to, and page attribution is exactly
    // what was missing when the result was silently truncated to page one.
    { type: "tabs", title: "Findings by page", field: "bugs", groupBy: "url",
      render: { type: "findings", title: "Findings, worst first", field: "bugs",
        textKey: "description", severityKey: "severity", detailKey: "recommendation" } },
    { type: "drawer", title: "Details", blocks: [
      // description and recommendation are shown in full by the findings list
      // above; repeating them here is what made this table 1543px wide.
      { type: "table", title: "Every bug", field: "bugs",
        columns: ["severity", "type", "url", "selector", "occurrences"] },
      { type: "rest", title: "Run info" },
    ] },
  ],
};

export function buildBugsTemplate(): string {
  return buildWidget(BUGS_SPEC);
}

/**
 * Empathy audit view.
 *
 * Barriers ranked by severity is the artifact worth showing someone -- it is
 * the output a product team acts on, and nested JSON buries the ordering that
 * makes it actionable.
 */
export const EMPATHY_SPEC: WidgetSpec = {
  id: "empathy",
  toolPage: "https://cbrowser.ai/docs/tool-empathy-audit/",
  title: "Empathy audit",
  // The persona is the subject of the audit, so it belongs in the title. The
  // bare view name did not say who was audited, and the tool tests exactly one
  // persona per call.
  titleField: "testedPersona",
  titlePrefix: "Empathy Audit: ",
  hero: {
    variant: "gradient",
    subtitle: { field: "scopeNote" },
    facts: [
      { field: "overallScore", label: "score" },
      { field: "topBarriers", label: "barriers" },
      { field: "resultsSummary", label: "personas" },
      { field: "device", label: "device" },
    ],
  },
  blocks: [
    // The overlay leads. It is what makes a score falsifiable by eye --
    // barriers drawn on the real page at their real positions -- and the
    // ranked list is the detail behind it.
    { type: "overlay", title: "Barriers on the page", field: "pageScreenshots",
      fetchTool: "artifact_fetch" },
    { type: "findings", title: "Barriers, worst first", field: "topBarriers",
      textKey: "description", severityKey: "severityForPersona", detailKey: "type" },
    { type: "drawer", title: "Details", blocks: [
      { type: "table", title: "Per persona", field: "resultsSummary" },
      { type: "table", title: "WCAG violations", field: "allWcagViolations" },
      { type: "table", title: "Remediation", field: "topRemediation" },
      { type: "rest", title: "Run info" },
    ] },
  ],
};

/**
 * Cognitive effort: the sequential transport chain, and what running it in
 * sequence costs over running it in parallel.
 *
 * The JSON answers "how expensive is this page for this persona" with a number,
 * and buries the reason inside `cognitiveTransportCost.chainCoefficient`.
 * The chain block puts the reason on screen: one bar per layer with
 * the bottleneck named, then the sum-of-parts against the actual sequential
 * total. The gap between those last two is the claim the whole model rests on.
 */
export const EFFORT_SPEC: WidgetSpec = {
  id: "effort",
  toolPage: "https://cbrowser.ai/docs/tool-cognitive-effort/",
  title: "Cognitive effort",
  // Who was measured belongs in the title; the cost is meaningless without them.
  titleField: "persona",
  titlePrefix: "Cognitive Effort: ",
  hero: {
    variant: "gradient",
    subtitle: { field: "interpretation" },
    facts: [
      // A percentile since 21.x, said as the rank it is ("costlier than 62%
      // of real pages") with its interval, never as a bare decimal (ISC-70).
      { field: "cognitiveTransportCost.total", label: "of real pages", format: "rank",
        intervalField: "cognitiveTransportCost.totalCTCInterval", figuresField: "cognitiveTransportCost.rankFigures",
        level: CTC_INTERVAL_LEVEL },
      { field: "cognitiveTransportCost.band", label: "band" },
      { field: "abandonmentRisk", label: "abandonment risk" },
      { field: "bottleneck", label: "bottleneck" },
      { field: "url", label: "page" },
    ],
  },
  blocks: [
    // Where the page ranks among the real reference pages, and how firmly the
    // reference fixes that rank: the 95% interval in words and on a scale.
    // Rounded as the verdict rounds (ctcRank). (ISC-70)
    { type: "rank", title: "Where this page ranks", field: "cognitiveTransportCost.total",
      intervalField: "cognitiveTransportCost.totalCTCInterval", figuresField: "cognitiveTransportCost.rankFigures",
      level: CTC_INTERVAL_LEVEL },
    // Leads the evidence, because it is the finding. Everything below is detail behind it.
    // Title carries no layer COUNT on purpose. It named a count and went stale
    // within the hour when readability was split into decoding and attention
    // (2026-08-02), so the widget captioned seven bars as six. The bars state
    // the count themselves; a number in prose is a second copy that drifts.
    { type: "chain", title: "The sequential transport chain", field: "layers",
      nameKey: "name", costKey: "cost", capacityKey: "capacityConsumed",
      bottleneckField: "bottleneck",
      additiveField: "cognitiveTransportCost.additive",
      // raw, not total: the bars share one scale with the layer costs and the
      // additive sum, which are layer-cost units. total is a percentile (21.x),
      // and drawn on that scale it was a 0-1 rank beside costs of 1 and more.
      totalField: "cognitiveTransportCost.raw",
      // Each bar opens into that layer's overlay on the real page. Layers with
      // no overlay stay inert and say why.
      overlaysField: "layerOverlays", fetchTool: "artifact_fetch" },
    // What the score rests on, in one sentence beside the finding: how many
    // of the constants it read are fitted, published, definitions or set by
    // hand. The full block is its own drawer below.
    { type: "provenance", field: "modelProvenance", variant: "line", subject: "score", seeAlso: "What this score rests on" },
    // The four law times the motor, decision, reading and procedure demands
    // come from (Stage B), each against the one time budget, so a reader sees
    // which law dominates. Field names from the tool (lawTimesReport). (ISC-70)
    // The caption keeps the page's times apart from the score's bottleneck,
    // named from the payload. It claims no law-to-layer map: every layer but
    // visualComplexity draws on a law time (frustration on reading, through
    // patience), and several also on page features no law covers.
    { type: "times", title: "Time this page asks for", field: "lawTimes", budgetKey: "budgetSeconds",
      caption: { field: "bottleneck", here: " (here, {value})",
        text: "These times are the page's, the same for every persona; the score's bottleneck{here} is the chain layer that costs this persona most, so it need not follow the largest time." },
      rows: [
      { key: "pointing", label: "Pointing", detail: "Fitts's law: reaching every target once" },
      { key: "choosing", label: "Choosing",
        detail: "novice visual search over every choice group once (Cockburn, Gutwin & Greenberg 2007)",
        alt: { secondsKey: "familiarSeconds", demandKey: "familiarDemand", fractionKey: "siteFamiliarity",
          label: "familiar visit", fractionLabel: "siteFamiliarity" } },
      // The per-label time is the payload's (law.reading.labelFirstRead, as
      // the run read it); without it the row says what is charged, no number.
      { key: "reading", label: "Reading",
        detail: "Brysbaert's silent reading rate over the prose outside menus, plus a first read of each visible menu label",
        detailTemplate: "Brysbaert's silent reading rate over the prose outside menus, plus {perLabelSeconds} s per visible menu label" },
      { key: "procedure", label: "Procedure", detail: "keystroke-level model: mental preparation per entry field" },
    ] },
    // familiarityWarning had a note here; 21.0 removed the site-knowledge
    // downgrade that produced it, so nothing emits the field any more.
    { type: "note", field: "languageWarning" },
    // Everything below the chain is behind an accordion.
    //
    // The chain IS the finding; the rest is the evidence behind it, and eight
    // stacked cards made the panel a scroll rather than an answer. Native
    // <details>, so each one is keyboard operable and announced as an expander
    // without any ARIA of our own.
    //
    // The warning above stays OUT of the accordions on purpose: a language
    // mismatch changes how every number below should be read, and a warning
    // behind a click is a warning nobody reads.
    { type: "drawer", title: "Where the cost sits", blocks: [
      { type: "kv", title: "Deficit vs surplus", field: "deficitVsSurplus" },
      { type: "kv", title: "Layer interactions", field: "interactions" },
    ] },
    { type: "drawer", title: "Motor accessibility", blocks: [
      { type: "kv", title: "Summary", fields: ["motorAccessibility.score", "motorAccessibility.barriers"] },
      { type: "table", title: "Hardest targets", field: "motorAccessibility.elements",
        columns: ["element", "hitProbability", "movementTimeMs"] },
    ] },
    { type: "drawer", title: "Readability", blocks: [
      // legibilityQuality, not score: high is GOOD here, while the readability
      // LAYER above is a cost where high is bad. Same word, opposite direction.
      { type: "kv", title: "Summary", fields: ["readability.legibilityQuality", "readability.averageWPM"] },
      { type: "findings", title: "Hardest block", field: "readability.hardestBlock", textKey: "0" },
    ] },
    { type: "drawer", title: "How these numbers are built", blocks: [
      { type: "kv", title: "Chain", fields: ["cognitiveTransportCost.raw", "cognitiveTransportCost.chainCoefficient"] },
      { type: "note", field: "cognitiveTransportCost.chainNote" },
      { type: "note", field: "abandonmentBasis" },
      { type: "note", field: "siteFamiliarityEffect" },
      { type: "note", title: "The law times", field: "lawTimes.note" },
    ] },
    // modelProvenance in full: counts with what each status means, the
    // block's scope and note, and the hand-set ids behind a disclosure. The
    // percentile's interval leads it, in percent, as the rank block says it.
    { type: "drawer", title: "What this score rests on", blocks: [
      { type: "provenance", title: "Where each number comes from", field: "modelProvenance", variant: "full",
        subject: "score", open: true,
        intervalField: "cognitiveTransportCost.totalCTCInterval", intervalFormat: "percent",
        intervalLabel: `${CTC_INTERVAL_LEVEL}% interval of the percentile` },
    ] },
    { type: "drawer", title: "Everything else", blocks: [
      { type: "rest", title: "Remaining fields" },
    ] },
  ],
};

export function buildEffortTemplate(): string {
  return buildWidget(EFFORT_SPEC);
}

export function buildEmpathyTemplate(): string {
  return buildWidget(EMPATHY_SPEC);
}

export function buildTraitTemplate(): string {
  return buildWidget(TRAIT_SPEC);
}

export function buildScreenshotTemplate(): string {
  return buildWidget(SCREENSHOT_SPEC);
}

export function buildAttentionTemplate(): string {
  return buildWidget(ATTENTION_SPEC);
}

export function buildAttentionCompareTemplate(): string {
  return buildWidget(ATTENTION_COMPARE_SPEC);
}

export function buildPersonaTemplate(): string {
  return buildWidget(PERSONA_SPEC);
}

export function buildPersonaManagerTemplate(): string {
  return buildWidget(PERSONA_MANAGER_SPEC);
}

export function buildPersonaCreatedTemplate(): string {
  return buildWidget(PERSONA_CREATED_SPEC);
}

export function buildPersonaUpdatedTemplate(): string {
  return buildWidget(PERSONA_UPDATED_SPEC);
}

export function buildStatusTemplate(): string {
  return buildWidget(STATUS_SPEC);
}

/** Read back a published capture panel by its resource URI. */
export function readCaptureUi(uri: string): string | undefined {
  const slug = uri.startsWith(CAPTURE_UI_PREFIX) ? uri.slice(CAPTURE_UI_PREFIX.length) : uri;
  return captureHtml.get(captureKey(slug, scopedAccountId()))?.html;
}

/** Register the inline-UI resources on a server. Safe to call more than once. */
export function registerUiResources(server: McpServer): void {
  if (registered.has(server)) return;
  registered.add(server);
  server.registerResource(
    "cbrowser-ui-probe",
    UI_PROBE_URI,
    { description: "Inline UI render probe (MCP Apps)", mimeType: MCP_APP_MIME },
    async () => ({
      contents: [{ uri: UI_PROBE_URI, mimeType: MCP_APP_MIME, text: PROBE_HTML }],
    }),
  );

  server.registerResource(
    "cbrowser-status-ui",
    "ui://cbrowser/status",
    { description: "CBrowser environment status panel", mimeType: MCP_APP_MIME },
    async () => ({
      contents: [{
        uri: "ui://cbrowser/status",
        mimeType: MCP_APP_MIME,
        // Read out of band there is no payload to render, so this stands in.
        // The populated panel travels inside the status tool result itself.
        text: buildStatusTemplate(),
      }],
    }),
  );

  server.registerResource(
    "cbrowser-bugs-ui",
    widgetUri("bugs"),
    { description: "Bug hunt findings ranked by severity", mimeType: MCP_APP_MIME },
    async () => ({
      contents: [{ uri: widgetUri("bugs"), mimeType: MCP_APP_MIME, text: buildBugsTemplate() }],
    }),
  );

  server.registerResource(
    "cbrowser-empathy-ui",
    widgetUri("empathy"),
    { description: "Accessibility barriers ranked by severity", mimeType: MCP_APP_MIME },
    async () => ({
      contents: [{ uri: widgetUri("empathy"), mimeType: MCP_APP_MIME, text: buildEmpathyTemplate() }],
    }),
  );

  server.registerResource(
    "cbrowser-effort-ui",
    widgetUri("effort"),
    { description: "Sequential cognitive transport chain with its bottleneck", mimeType: MCP_APP_MIME },
    async () => ({
      contents: [{ uri: widgetUri("effort"), mimeType: MCP_APP_MIME, text: buildEffortTemplate() }],
    }),
  );

  server.registerResource(
    "cbrowser-trait-ui",
    widgetUri("trait-v2"),
    { description: "Trait level scale with behavioural bands", mimeType: MCP_APP_MIME },
    async () => ({
      contents: [{ uri: widgetUri("trait-v2"), mimeType: MCP_APP_MIME, text: buildTraitTemplate() }],
    }),
  );

  server.registerResource(
    "cbrowser-screenshot-ui",
    widgetUri("screenshot"),
    { description: "Screenshot with page and viewport context", mimeType: MCP_APP_MIME },
    async () => ({
      contents: [{ uri: widgetUri("screenshot"), mimeType: MCP_APP_MIME, text: buildScreenshotTemplate() }],
    }),
  );

  server.registerResource(
    "cbrowser-attention-ui",
    widgetUri("attention"),
    { description: "Attention heatmap with ranked elements", mimeType: MCP_APP_MIME },
    async () => ({
      contents: [{ uri: widgetUri("attention"), mimeType: MCP_APP_MIME, text: buildAttentionTemplate() }],
    }),
  );

  server.registerResource(
    "cbrowser-attention-compare-ui",
    widgetUri("attention-compare"),
    { description: "Two personas' attention differenced, with each one's perceptual filter", mimeType: MCP_APP_MIME },
    async () => ({
      contents: [{ uri: widgetUri("attention-compare"), mimeType: MCP_APP_MIME, text: buildAttentionCompareTemplate() }],
    }),
  );

  server.registerResource(
    "cbrowser-persona-ui",
    widgetUri("persona"),
    { description: "Persona traits, values and accessibility profile", mimeType: MCP_APP_MIME },
    async () => ({
      contents: [{ uri: widgetUri("persona"), mimeType: MCP_APP_MIME, text: buildPersonaTemplate() }],
    }),
  );

  server.registerResource(
    "cbrowser-persona-manager-ui",
    widgetUri("persona-manager"),
    { description: "Interactive persona CRUD: roster, inline trait editor, save and delete", mimeType: MCP_APP_MIME },
    async () => ({
      contents: [{ uri: widgetUri("persona-manager"), mimeType: MCP_APP_MIME, text: buildPersonaManagerTemplate() }],
    }),
  );

  server.registerResource(
    "cbrowser-persona-created-ui",
    widgetUri("persona-created"),
    { description: "A persona that was just created, with its values route and any traits declared unsupported", mimeType: MCP_APP_MIME },
    async () => ({
      contents: [{ uri: widgetUri("persona-created"), mimeType: MCP_APP_MIME, text: buildPersonaCreatedTemplate() }],
    }),
  );

  server.registerResource(
    "cbrowser-persona-updated-ui",
    widgetUri("persona-updated"),
    { description: "What a persona update changed, and whether the description still matches the traits", mimeType: MCP_APP_MIME },
    async () => ({
      contents: [{ uri: widgetUri("persona-updated"), mimeType: MCP_APP_MIME, text: buildPersonaUpdatedTemplate() }],
    }),
  );

  server.registerResource(
    "cbrowser-capture-ui",
    // A template with no list callback never appears in resources/list, so a
    // host that discovers views by listing would never find a capture panel --
    // and it fails silently, the way a URI mismatch does. Published captures are
    // enumerated instead, which is cheap because the store is bounded at 24.
    // Only the caller's own partition is listed or read. (tenant, 2026-10-10)
    new ResourceTemplate(`${CAPTURE_UI_PREFIX}{slug}`, {
      list: async () => {
        const caller = scopedAccountId();
        return {
          resources: [...captureHtml.values()]
            .filter((entry) => entry.accountId === caller)
            .map(({ slug }) => ({
              uri: `${CAPTURE_UI_PREFIX}${slug}`,
              name: `Capture player: ${slug}`,
              mimeType: MCP_APP_MIME,
            })),
        };
      },
    }),
    { description: "Inline capture player with embedded frames", mimeType: MCP_APP_MIME },
    async (uri, vars) => {
      const slug = String(Array.isArray(vars.slug) ? vars.slug[0] : vars.slug ?? "");
      // Another account's slug reads exactly like an expired one.
      const html = captureHtml.get(captureKey(slug, scopedAccountId()))?.html;
      return {
        contents: [{
          uri: uri.href,
          mimeType: MCP_APP_MIME,
          // An expired slug is normal, not an error: the store is bounded and a
          // host may re-read an old panel. Say so plainly instead of throwing.
          text: html ?? `<!doctype html><meta charset="utf-8">
<div style="font:15px/1.5 ui-sans-serif,system-ui,sans-serif;padding:18px">
  <p>This capture is no longer held in memory. Re-run the capture, or open the full
  player link from the original tool result.</p>
</div>`,
        }],
      };
    },
  );
}
