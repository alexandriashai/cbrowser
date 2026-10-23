/**
 * Widget kit for MCP Apps views.
 *
 * An MCP Apps resource is static: the host fetches it once, caches it against
 * its URI, and hydrates it at runtime with the tool result. So a widget cannot
 * be a rendered document -- it has to be a renderer plus a description of what
 * to render, with the data arriving later.
 *
 * That shape is what makes a kit possible. Every widget ships the same chrome
 * (tokens, hero, tables, chips, accordions), the same runtime, and the same
 * hydration and safety rules; what differs per tool is a small declarative
 * spec naming which fields become which blocks. Adding a view is writing a
 * spec, not another copy of 400 lines of CSS that will drift from its
 * siblings by the third one.
 *
 * The alternative -- one hand-written template per tool -- was rejected after
 * the status widget, where the CSS, the ext-apps bundling, the theme handling,
 * the textContent discipline and three separate blank-render fixes would all
 * have had to be repeated verbatim eight more times.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TRAIT_DEFINITIONS } from "../trait-reference.js";

/** The MIME the host keys on to render a resource as an interactive view. */
export const MCP_APP_MIME = "text/html;profile=mcp-app";

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

/** A dotted path into the tool's structuredContent, e.g. "healCache.totalHeals". */
export type FieldPath = string;

export interface FactSpec {
  /** Field holding the value, or a ratio when `of` is given. */
  field: FieldPath;
  label: string;
  /** Renders `n/total` by counting entries of `field` whose `flag` is true. */
  countFlag?: string;
  /** Highlight when the count is short of the total. */
  attnWhenShort?: boolean;
  /**
   * For an object value: one template per value of its `by` key, with {key}
   * placeholders filled from the object ("*" is the fallback). Built for
   * perceptualProfile, whose {resolution, name} pair reads as one phrase only
   * when the resolution picks the wording: "generic default" says what
   * "default (default)" does not.
   */
  by?: string;
  templates?: Record<string, string>;
}

export interface HealthCheck {
  /** Array field to scan. */
  field: FieldPath;
  /** Boolean property that must be true for each entry. */
  flag: string;
  /** Human noun for a failing entry, e.g. "browser not installed". */
  failLabel: string;
  /** Property to name the failing entry by. */
  nameKey?: string;
}

export type BlockSpec =
  /** Key/value rows from an object (or a flat list of scalar fields). */
  | { type: "kv"; title: string; field?: FieldPath; fields?: FieldPath[] }
  /** A grid from an array of records; columns are the union of keys. */
  | { type: "table"; title: string; field: FieldPath;
      /**
       * Columns to show, in order. Without it every key becomes a column: the
       * bug table rendered eight, including description and recommendation
       * that the findings list above already shows in full, and came out
       * 1543px wide inside an 864px panel. A table in a widget is an index,
       * not a data dump.
       */
      columns?: string[] }
  /**
   * One tab per distinct value of `groupBy`, each holding the rows that share
   * it. Built for "bugs by page": a flat list of 21 findings across 4 pages
   * buries which page each belongs to, and the per-page counts were only
   * visible as a summary object.
   */
  | { type: "tabs"; title: string; field: FieldPath; groupBy: string;
      /** Block rendered inside each tab, over that group's rows. */
      render: BlockSpec }
  /** A severity-ranked list: the shape audits and bug hunts actually produce. */
  | { type: "findings"; title: string; field: FieldPath;
      textKey: string; severityKey?: string; detailKey?: string }
  /** A headline grade with a weighted category breakdown. */
  | { type: "score"; title: string; gradeField?: FieldPath; scoreField?: FieldPath;
      categoriesField?: FieldPath; labelKey?: string; valueKey?: string; weightKey?: string }
  /** An image the widget fetches after mount, since results are size-capped. */
  | { type: "image"; title: string; urlField?: FieldPath; dataField?: FieldPath;
      fetchTool?: string; fetchArgsField?: FieldPath;
      /** Argument name to payload field, e.g. {file: "heatmapFile"}. */
      fetchArgs?: Record<string, FieldPath>;
      caption?: FieldPath;
      /**
       * Shown instead of the image when the result names no file to fetch,
       * saying why. Without it a generic sentence is shown; never a broken image.
       */
      emptyNote?: string }
  /**
   * Persona trait/value meters, matching the account persona editor.
   *
   * Three ramps, one per section, so the section is legible from colour alone:
   *   trait          red-to-green,      hue = value * 120        (editor verbatim)
   *   value          blue-to-purple,    hue = 220 + value * 80   (editor verbatim)
   *   accessibility  yellow-to-orange,  hue = 55 - value * 30
   *
   * The first two match cbrowser.ai's persona editor exactly. The third is a
   * deliberate divergence: the editor currently draws accessibility traits with
   * the same red-to-green ramp as cognitive ones, which makes two different
   * kinds of measurement look like one. Severity also runs the other way for
   * these -- a high value is more impairment, not more capability -- so a ramp
   * whose "good" end is green would actively mislead.
   */
  | { type: "traits"; title: string; field: FieldPath;
      ramp?: "trait" | "value" | "accessibility";
      nameKey?: string; valueKey?: string;
      /** Show a definition tooltip on each label, from the baked-in glossary. */
      describe?: boolean;
      /**
       * Where the values come from (trait-provenance.ts): a status line over
       * the meters, "cited" on a value personas.ts cites a source beside, and
       * "default" on a value the persona does not set.
       */
      provenanceField?: FieldPath }
  /**
   * Editable trait sliders that write back through app.callServerTool.
   *
   * Same shape as `traits`, plus where to find the persona's name and which
   * tool to call on save. Read-only blocks stay read-only: this is opt-in per
   * block rather than a mode on the widget.
   */
  /**
   * The full persona CRUD surface: roster, inline editor, save and delete.
   * Writes go out through callServerTool to the existing tools rather than
   * being reimplemented here.
   */
  | { type: "manager"; title: string; field: FieldPath }
  | { type: "editor"; title: string; field: FieldPath;
      /** Where the persona's name lives in the payload; defaults to `persona`. */
      personaField?: FieldPath;
      /** Tool called on save; defaults to persona_update. */
      saveTool?: string;
      ramp?: "trait" | "value" | "accessibility";
      nameKey?: string; valueKey?: string;
      describe?: boolean;
      /** As on `traits`. */
      provenanceField?: FieldPath }
  /**
   * A banded scale with the queried point marked.
   *
   * For data shaped as "here are the five levels this trait can take, here is
   * the one you asked about". The bands are the finding: a reader wants to see
   * where 0.3 sits relative to the others, which a list of five objects does
   * not show.
   */
  | { type: "levels"; title: string; field: FieldPath;
      valueField?: FieldPath; labelField?: FieldPath; behaviorsField?: FieldPath }
  /**
   * A screenshot with barrier boxes drawn over it.
   *
   * The artifact an accessibility audit actually hands someone: barriers at
   * their real positions on the real page, which makes a score falsifiable by
   * eye. Boxes are positioned in percentages so they track the image at any
   * rendered width, and every box carries a text label -- colour must never be
   * the only carrier of meaning (WCAG 1.4.1), least of all in a tool that
   * reports on exactly that.
   */
  | { type: "overlay"; title: string; field: FieldPath;
      fetchTool?: string; fileKey?: string; rectsKey?: string;
      widthKey?: string; heightKey?: string; labelKey?: string }
  /**
   * A sequential cost chain with its bottleneck named.
   *
   * Built for cognitive_effort, whose whole thesis is that the layers are
   * SEQUENTIAL, not additive: each layer hands its residual capacity to the
   * next, so a cost late in the chain lands on an already-depleted budget. The
   * payload states that outright as `chainCoefficient = raw / additive`
   * and the JSON buries it in a nested object.
   *
   * So the block shows two bars against one scale -- what the layers cost added
   * up, and what they actually cost in sequence -- and the gap between them IS
   * the product's central claim, made visible instead of asserted.
   *
   * The bottleneck carries a text label, never colour alone (WCAG 1.4.1).
   */
  | { type: "chain"; title: string; field: FieldPath;
      nameKey?: string; costKey?: string; capacityKey?: string;
      /** Where the named bottleneck layer lives. */
      bottleneckField?: FieldPath;
      /**
       * Sum-of-parts and in-sequence totals, for the amplification bars. Both in
       * layer-cost units, the scale of the bars above them: for cognitive_effort
       * that is `raw`, never `total` (a percentile since 21.x).
       */
      additiveField?: FieldPath; totalField?: FieldPath;
      /**
       * Per-layer overlays, so a bar opens into the thing it measured.
       *
       * Entries carry {layer, file, legend, available, reason}. A layer with an
       * overlay becomes a real <button>; a layer without one stays an inert row
       * that states why. An affordance that does nothing is worse than no
       * affordance, and "there is no overlay for frustration because it is a
       * running state, not a place on the page" is information.
       */
      overlaysField?: FieldPath; fetchTool?: string }
  /**
   * What the numbers in an answer rest on: a provenance summary
   * ({counts, hypotheses, scope, note}, model-provenance.ts).
   *
   * "line" is one sentence of counts, for beside the finding. "full" adds
   * what each status means, the summary's own scope and note, and the
   * hypothesis ids behind a disclosure. Without this block the summary fell
   * into the rest dump, where its hundred ids printed as one joined string.
   */
  | { type: "provenance"; title?: string; field: FieldPath;
      variant?: "line" | "full";
      /** What read the constants, for the sentence: "score" reads "This score reads ...". */
      subject?: string;
      /** The drawer that holds the full block, named at the end of the line. */
      seeAlso?: string;
      /** Start the section open when the drawer holding it is opened. */
      open?: boolean;
      /**
       * A [low, high] pair shown first in the full block when the payload
       * carries it: the interval the score's own uncertainty spans. Absent
       * from the payload, nothing is drawn.
       */
      intervalField?: FieldPath; intervalLabel?: string }
  /**
   * Free prose. For an object value, `by` and `templates` pick the sentence
   * as FactSpec's do, so a {resolution, name} pair can read as a sentence.
   */
  | { type: "note"; title?: string; field: FieldPath; by?: string; templates?: Record<string, string> }
  /** Everything not consumed by another block, so no field is silently dropped. */
  | { type: "rest"; title: string }
  /** Groups blocks behind one expander; the default state stays a card. */
  | { type: "drawer"; title: string; blocks: BlockSpec[]; open?: boolean };

export interface WidgetSpec {
  /** Resource id; the URI becomes ui://cbrowser/<id>. */
  id: string;
  /** Hero title. Names the view, not the product. */
  title: string;
  /** Prefer this field from the payload as the title when present. */
  titleField?: FieldPath;
  /**
   * Prepended to the resolved titleField value. "Empathy Audit: " plus the
   * persona says what the view IS and what it is OF; the persona name alone
   * said only the second half.
   */
  titlePrefix?: string;
  /**
   * The tool's page on cbrowser.ai, rendered as a hero action on every view.
   *
   * Only three of the 120 tools have their own page today (empathy-audit,
   * hunt-bugs, marketing-campaign, verified by fetching each and checking the
   * title is not the homepage fallback the SPA serves for unknown paths). The
   * rest point at the /tools/ index, which is a real page. When a tool page is
   * built, this is the one line that changes.
   */
  toolPage?: string;
  hero?: {
    /** gradient: brand sweep with depth. solid: flat brand. bare: no band. */
    variant?: "gradient" | "solid" | "bare";
    /** Line under the title; a literal, or {field} to read from the payload. */
    subtitle?: string | { field: FieldPath };
    /** Health pill. Omit for views with nothing that can be "wrong". */
    health?: { checks: HealthCheck[] };
    facts?: FactSpec[];
    /**
     * Outbound links, rendered as buttons.
     *
     * Routed through app.openLink rather than an anchor: the widget sandbox
     * blocks window.open and target=_blank outright, so a plain link is a
     * button that does nothing at all.
     */
    actions?: Array<{ label: string; url: string; urlField?: FieldPath }>;
  };
  blocks: BlockSpec[];
  /** Muted line at the very bottom. */
  footer?: { label: string; field: FieldPath };
}

export const widgetUri = (id: string): string => `ui://cbrowser/${id}`;

// ---------------------------------------------------------------------------
// Inlined assets
// ---------------------------------------------------------------------------

const here = (): string => dirname(fileURLToPath(import.meta.url));

/**
 * The ext-apps browser bundle, inlined into every widget.
 *
 * Not a CDN import. The iframe CSP blocks esm.sh from fetching the transitive
 * SDK dependencies, and the failure is a blank rectangle whose error appears
 * only in the iframe's own devtools console -- nothing surfaces host-side,
 * which is why an esm.sh import looks correct right up until nothing renders.
 *
 * The replacer is a function, not a string: String.replace interprets
 * $-sequences and the minified bundle is full of them.
 */
let extAppsBundle: string | undefined;
export function getExtAppsBundle(): string {
  if (extAppsBundle !== undefined) return extAppsBundle;
  try {
    const req = createRequire(import.meta.url);
    const raw = readFileSync(req.resolve("@modelcontextprotocol/ext-apps/app-with-deps"), "utf8");
    extAppsBundle = raw.replace(/export\{([^}]+)\};?\s*$/, (_m, body: string) =>
      "globalThis.ExtApps={" +
      body.split(",").map((pair) => {
        const [local, exported] = pair.split(" as ").map((x) => x.trim());
        return `${exported ?? local}:${local}`;
      }).join(",") + "};");
  } catch {
    extAppsBundle = "globalThis.ExtApps=undefined;";
  }
  return extAppsBundle;
}

/**
 * The cbrowser mark as a data URI, brightened for badge size.
 *
 * The sandbox will not fetch cbrowser.ai, so an external src renders broken.
 * The asset is ~100 rects whose opacity ramps to 0.31 -- deliberate at poster
 * size, and at 27px each dot renders around a pixel tall, so the faint end
 * drops out of the raster entirely. Opacity is floored, fills lifted, and each
 * dot stroked, because at that size a stroke is what gives a dot enough mass
 * to survive rasterisation; brightness alone cannot save something that rounds
 * away. Applied here rather than to the file so the brand asset stays canonical.
 */
let logoUri: string | undefined;
export function getLogoDataUri(): string {
  if (logoUri !== undefined) return logoUri;
  try {
    const raw = readFileSync(join(here(), "..", "..", "assets", "cbrowser-logo.svg"), "utf8")
      .replace(/\s*\n\s*/g, " ");
    const brighten = (c: number): number => Math.round(c + (255 - c) * 0.34);
    const svg = raw
      .replace(/opacity="([\d.]+)"/g, (_m, v: string) =>
        `opacity="${Math.min(1, 0.62 + parseFloat(v) * 0.38).toFixed(3)}"`)
      .replace(/fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"/g, (_m, r: string, g: string, b: string) => {
        const c = `rgb(${brighten(+r)},${brighten(+g)},${brighten(+b)})`;
        return `fill="${c}" stroke="${c}" stroke-width="5" stroke-linejoin="round"`;
      })
      .replace(/stdDeviation="5"/, 'stdDeviation="7"')
      .replace(/"/g, "'");
    logoUri = "data:image/svg+xml," + encodeURIComponent(svg).replace(/'/g, "%27");
  } catch {
    logoUri = "";
  }
  return logoUri;
}

/**
 * Soft arcs and an angled facet over the hero, as an inline SVG.
 *
 * preserveAspectRatio=none so one small asset stretches to any hero width.
 * This layering, rather than a flatter ramp, is what reads as a lit surface.
 */
const HERO_ART = (() => {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 200' preserveAspectRatio='none'>" +
    "<path d='M0,128 C150,58 330,168 505,96 C645,38 730,78 800,52 L800,200 L0,200 Z' fill='#ffffff' opacity='.10'/>" +
    "<path d='M0,171 C190,116 372,190 548,142 C688,104 754,132 800,116 L800,200 L0,200 Z' fill='#ffffff' opacity='.07'/>" +
    "<path d='M556,0 L800,0 L800,200 L678,200 Z' fill='#ffffff' opacity='.05'/>" +
    "</svg>";
  return "data:image/svg+xml," + encodeURIComponent(svg);
})();

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

/**
 * Shared stylesheet.
 *
 * Hero stops are darker than the site's brand tokens on purpose: the white
 * bloom lifts the ground under white text, and the contrast floor is measured
 * off composited pixels rather than these declarations. Horizontal inset never
 * drops below the host card's corner radius, or narrow widths put text back
 * inside the arc.
 */
const CSS = `
  /* Neutrals mirror the site's shadcn palette (cbrowser-web src/app/globals.css)
     so a widget and the dashboard read as one product. The HOST variable still
     wins in every case -- these are only the fallback for a host that supplies
     nothing. A widget should look native to the surface it is embedded in
     first, and like cbrowser second.
     Measured against a white ground: ink 19.80:1, sub 5.49:1 (WCAG AA is 4.5). */
  :root{
    --ink:var(--color-text-primary,oklch(0.145 0 0));
    --sub:var(--color-text-secondary,oklch(0.520 0 0));
    --line:var(--color-border-default,oklch(0.922 0 0));
    --brand:oklch(0.55 0.18 250);
    --brand-2:oklch(0.6 0.18 180);
    --hero-a:oklch(0.415 0.19 258);
    --hero-b:oklch(0.45 0.13 202);
    --accent:var(--color-accent-primary,oklch(0.55 0.18 250));
    --on-accent:#fff;
    --warn:oklch(0.55 0.16 45);
    --ok:oklch(0.62 0.16 150);
    --bad:oklch(0.52 0.19 25);
    --raise:color-mix(in srgb, var(--ink) 4%, transparent);
    --r:var(--border-radius-md,0.625rem);
    --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  /* Dark mode reads host variables too. It did not until 2026-08-05 -- these
     three were hardcoded, so a host that themed the light widget was ignored
     the moment the user switched to dark, and the widget stopped matching the
     surface it sits on. Same fallback discipline as :root above.
     Measured on an oklch(0.145) ground: ink 18.97:1, sub 7.66:1. */
  :root.dark{
    --ink:var(--color-text-primary,oklch(0.985 0 0));
    --sub:var(--color-text-secondary,oklch(0.708 0 0));
    --line:var(--color-border-default,oklch(1 0 0 / 12%));
    --brand:oklch(0.65 0.18 250);--brand-2:oklch(0.7 0.15 180);
    --hero-a:oklch(0.385 0.18 258);--hero-b:oklch(0.42 0.12 202);
    --accent:oklch(0.65 0.18 250);--on-accent:oklch(0.145 0 0);
    --warn:oklch(0.72 0.14 55);--ok:oklch(0.72 0.15 150);
    --bad:oklch(0.68 0.17 25);
    --raise:color-mix(in srgb, #fff 6%, transparent)}
  *{box-sizing:border-box}
  html,body{background:transparent;color:var(--ink)}
  body{margin:0;padding:0;font:15px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}

  .hero{padding:16px 18px 15px;color:#fff}
  .hero.gradient{background:
      radial-gradient(115% 95% at 10% -12%, rgba(255,255,255,.20), transparent 58%),
      radial-gradient(95% 85% at 98% 118%, rgba(0,0,0,.26), transparent 60%),
      url("${HERO_ART}") center/100% 100% no-repeat,
      linear-gradient(118deg,var(--hero-a),var(--hero-b))}
  .hero.solid{background:var(--hero-a)}
  .hero.bare{background:transparent;color:var(--ink);padding-bottom:8px}
  .hrow{display:flex;align-items:center;gap:.6rem}
  .badge{flex:0 0 auto;width:37px;height:37px;border-radius:50%;display:grid;place-items:center;
    background:#14171d;box-shadow:0 0 0 1px rgba(255,255,255,.18), 0 1px 3px rgba(0,0,0,.28)}
  .hero.bare .badge{box-shadow:0 0 0 1px rgba(0,0,0,.12), 0 1px 3px rgba(0,0,0,.14)}
  .badge img{width:27px;height:27px;display:block}
  .htitle{font-size:1.08rem;font-weight:650;letter-spacing:-.01em}
  .health{margin-left:auto;display:inline-flex;align-items:center;gap:.4rem;
    padding:.28rem .6rem;border-radius:999px;background:rgba(255,255,255,.94);
    font:650 .7rem/1 var(--mono);letter-spacing:.09em;color:#1b3a2b}
  .hero.bare .health{background:color-mix(in srgb,var(--ok) 16%,transparent);color:var(--ink)}
  .health .dot{width:7px;height:7px;border-radius:50%;background:var(--ok);flex:0 0 auto}
  .health.bad{color:#4a2410} .health.bad .dot{background:var(--warn)}
  .health.unknown{color:#33383f} .health.unknown .dot{background:#8a9099}
  .hnote{margin:.5rem 0 0;font-size:.79rem;color:#fff}
  .hero.bare .hnote{color:var(--sub)}

  .subttl{font-size:.8rem;color:rgba(255,255,255,.92);margin:.3rem 0 0}
  .hero.bare .subttl{color:var(--sub)}
  .acts{display:flex;flex-wrap:wrap;gap:.4rem;margin:.75rem 0 0}
  .act{font:600 .74rem/1 ui-sans-serif,system-ui,sans-serif;padding:.42rem .7rem;border-radius:6px;
    border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.96);color:#123;
    cursor:pointer;transition:background 150ms ease}
  .act:hover{background:#fff}
  .act:focus-visible{outline:2px solid #fff;outline-offset:2px}
  .hero.bare .act{background:var(--brand);color:#fff;border-color:transparent}
  .facts{display:flex;flex-wrap:wrap;gap:.34rem;margin:.7rem 0 0}
  .fact{display:inline-flex;align-items:baseline;gap:.34rem;padding:.24rem .52rem;
    border:1px solid rgba(255,255,255,.32);border-radius:6px;background:rgba(255,255,255,.10)}
  .fact b{font:650 .82rem/1 var(--mono);font-variant-numeric:tabular-nums;color:#fff}
  .fact span{font-size:.74rem;color:#fff}
  .fact.attn{background:rgba(255,255,255,.94);border-color:transparent}
  .fact.attn b{color:#7a3410} .fact.attn span{color:#5d3520}
  .hero.bare .fact{border-color:var(--line);background:var(--raise)}
  .hero.bare .fact b{color:var(--brand)} .hero.bare .fact span{color:var(--sub)}

  .body{padding:0 18px 16px}
  .drawer{border-top:1px solid var(--line)}
  .drawer>summary{display:flex;align-items:center;gap:.5rem;padding:.7rem 18px;cursor:pointer;
    list-style:none;user-select:none;font-size:.87rem;font-weight:560}
  .drawer>summary::-webkit-details-marker{display:none}
  .drawer>summary:hover{color:var(--accent)}
  .drawer>summary:focus-visible{outline:2px solid var(--accent);outline-offset:-3px}
  .dcount{margin-left:auto;font:.75rem/1 var(--mono);color:var(--sub)}
  .inner{padding:0 18px 16px}

  details.sec{border-top:1px solid var(--line)}
  details.sec:first-of-type{border-top:0}
  details.sec>summary{display:flex;align-items:center;gap:.5rem;padding:.55rem 0;cursor:pointer;
    list-style:none;user-select:none}
  details.sec>summary::-webkit-details-marker{display:none}
  details.sec>summary:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;border-radius:4px}
  details.sec>summary:hover .stitle{color:var(--accent)}
  .chev{flex:0 0 auto;width:8px;height:8px;border-right:1.6px solid var(--sub);
    border-bottom:1.6px solid var(--sub);transform:rotate(-45deg);
    transition:transform 180ms cubic-bezier(.22,1,.36,1)}
  details[open]>summary .chev{transform:rotate(45deg)}
  .stitle{font-size:.88rem;font-weight:560;transition:color 150ms ease}
  .scount{margin-left:auto;font:.74rem/1 var(--mono);color:var(--sub);font-variant-numeric:tabular-nums}
  .sbody{padding:0 0 .65rem}
  .btitle{font-size:.88rem;font-weight:560;margin:.9rem 0 .4rem}

  .scroll{overflow-x:auto;max-width:100%}
  table{border-collapse:collapse;width:100%;font-size:.85rem}
  /* Fixed layout with a capped label column. The label was width:1% plus
     white-space:nowrap -- shrink-to-fit, which works until a label cannot
     shrink. Run info flattens nested keys into "A > B > C" strings, and an
     unwrappable one took the whole row, leaving the value column 10-20px
     wide. Labels wrap now and the split is enforced rather than negotiated. */
  .kv{table-layout:fixed}
  .kv th{width:38%;text-align:left;padding:.24rem .9rem .24rem 0;
    font:.77rem/1.45 var(--mono);color:var(--sub);font-weight:400;vertical-align:top;
    white-space:normal;overflow-wrap:anywhere}
  .kv td{padding:.24rem 0;vertical-align:top;word-break:break-word;overflow-wrap:anywhere}
  /* Below ~30rem a 38/62 split leaves neither side usable: stack instead. */
  @media (max-width:30rem){
    .kv,.kv tbody,.kv tr,.kv th,.kv td{display:block;width:auto}
    .kv th{padding:.24rem 0 0;}
    .kv td{padding:0 0 .35rem;border-bottom:1px solid color-mix(in srgb,var(--line) 45%,transparent)}
  }
  .grid{table-layout:auto}
  .grid thead th{text-align:left;padding:.18rem .7rem .3rem 0;font:.67rem/1.3 var(--mono);
    color:var(--sub);font-weight:400;text-transform:uppercase;letter-spacing:.07em;
    border-bottom:1px solid var(--line);white-space:normal}
  /* Cells wrap. Long URLs and selectors used to push the table past the panel
     and rely on the horizontal scroller to hide it. */
  .grid td{overflow-wrap:anywhere;word-break:break-word;vertical-align:top;max-width:22rem}
  .grid td{padding:.28rem .7rem .28rem 0;border-bottom:1px solid color-mix(in srgb,var(--line) 55%,transparent)}
  .grid tr:last-child td{border-bottom:0}
  .grid tbody tr:hover td{background:var(--raise)}
  .num{text-align:right;font-variant-numeric:tabular-nums;font-family:var(--mono);font-size:.79rem}
  .path{font-family:var(--mono);font-size:.77rem;color:var(--sub);word-break:break-all}
  .chip{display:inline-block;font:.67rem/1 var(--mono);padding:.15rem .36rem;border-radius:3px;
    background:color-mix(in srgb,var(--ok) 18%,transparent);color:color-mix(in srgb,var(--ok) 65%,var(--ink))}
  .chip.no{background:color-mix(in srgb,var(--warn) 18%,transparent);color:color-mix(in srgb,var(--warn) 82%,var(--ink))}

  /* Findings: severity is encoded as a leading bar and a chip, so the ranking
     reads without parsing the text of every row. */
  .finds{list-style:none;padding:0;margin:0}
  .finds li{display:grid;grid-template-columns:auto 1fr;gap:.55rem;align-items:baseline;
    padding:.4rem 0;border-bottom:1px solid color-mix(in srgb,var(--line) 55%,transparent)}
  .finds li:last-child{border-bottom:0}
  .sev{font:650 .62rem/1 var(--mono);letter-spacing:.07em;text-transform:uppercase;
    padding:.2rem .36rem;border-radius:3px;white-space:nowrap}
  .sev.critical,.sev.blocker{background:color-mix(in srgb,var(--bad) 22%,transparent);color:color-mix(in srgb,var(--bad) 85%,var(--ink))}
  .sev.high,.sev.major,.sev.serious{background:color-mix(in srgb,var(--warn) 22%,transparent);color:color-mix(in srgb,var(--warn) 85%,var(--ink))}
  .sev.medium,.sev.moderate{background:color-mix(in srgb,var(--brand) 18%,transparent);color:color-mix(in srgb,var(--brand) 85%,var(--ink))}
  .sev.low,.sev.minor,.sev.info,.sev.notice{background:var(--raise);color:var(--sub)}
  .fdetail{grid-column:2;font-size:.79rem;color:var(--sub);margin:.15rem 0 0}

  /* Score: one headline grade, then weighted categories as proportional bars.
     The weight is shown because a 90 in a 15%-weighted category is not the
     same finding as a 90 in a 35%-weighted one. */
  .score{display:flex;align-items:center;gap:.9rem;margin:.2rem 0 .7rem}
  .grade{font:700 2.1rem/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:-.03em}
  .grade.a{color:var(--ok)} .grade.b{color:var(--ok)} .grade.c{color:var(--warn)}
  .grade.d{color:var(--bad)} .grade.f{color:var(--bad)}
  .scoresub{font:.78rem/1.4 var(--mono);color:var(--sub)}
  .cats{list-style:none;padding:0;margin:0}
  .cats li{display:grid;grid-template-columns:1fr auto;gap:.4rem .6rem;padding:.28rem 0}
  .catname{font-size:.82rem}
  .catval{font:.78rem/1 var(--mono);color:var(--sub);font-variant-numeric:tabular-nums}
  .bar{grid-column:1/-1;height:5px;border-radius:3px;background:var(--raise);overflow:hidden}
  .bar i{display:block;height:100%;border-radius:3px;background:var(--brand)}

  /* Trait meters, matching cbrowser.ai's persona editor: fixed-width right
     aligned label, a pill track with a baseline tick at 0.5 so above- and
     below-average read instantly, and a two-decimal monospace readout. */
  .traits{display:flex;flex-direction:column;gap:.28rem}
  .trait{display:flex;align-items:center;gap:.5rem}
  /* Editor. The dirty state is a left border rather than a colour change on the
     value, so it survives both themes and does not rely on hue alone --
     WCAG 1.4.1: colour is not the only channel carrying the information. */
  .trait.dirty{border-left:3px solid var(--accent);padding-left:.5rem;margin-left:-.75rem}
  .mgrcols{display:flex;gap:1rem;align-items:flex-start;flex-wrap:wrap}
  .mgrlist{flex:0 0 13rem;display:flex;flex-direction:column;gap:.15rem;
    max-height:22rem;overflow-y:auto}
  .mgrpane{flex:1 1 18rem;min-width:0}
  .mgrrow{display:flex;flex-direction:column;align-items:flex-start;gap:.1rem;
    font:inherit;text-align:left;background:none;border:0;border-radius:.375rem;
    padding:.4rem .55rem;cursor:pointer;color:var(--ink)}
  .mgrrow:hover{background:color-mix(in oklch,var(--accent) 12%,transparent)}
  .mgrrow.on{background:color-mix(in oklch,var(--accent) 22%,transparent);
    box-shadow:inset 3px 0 0 var(--accent)}
  /* --sub on the selected row's accent tint measured 4.03:1. */
  .mgrrow.on .cap{color:var(--ink)}
  .mgrrow:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
  .mgrname{font-size:.85rem;font-weight:600}
  .modetabs{display:flex;gap:.3rem;flex-wrap:wrap;margin:.4rem 0 .5rem}
  .modetab{font:inherit;font-size:.78rem;padding:.3rem .6rem;border-radius:999px;
    border:1px solid var(--line);background:none;color:var(--sub);cursor:pointer}
  /* Foreground is a token, not #fff. White clears AA on the light accent
     (4.79:1) and fails on the dark one (3.24:1), because --accent lightens in
     dark mode while the text stayed fixed. A fill that changes between themes
     needs a foreground that changes with it. Near-black on the dark accent is
     6.11:1. */
  .modetab.on{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
  .modetab:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .tin{width:100%;box-sizing:border-box;font:inherit;font-size:.85rem;
    padding:.4rem .5rem;border-radius:.375rem;border:1px solid var(--line);
    background:transparent;color:var(--ink);margin-bottom:.5rem}
  .tin:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
  .fields{max-height:20rem;overflow-y:auto}
  .mgrh{font-size:1rem;margin:0 0 .15rem}
  /* Single column on narrow viewports: a 13rem list beside an 18rem pane
     cannot both fit on a phone, and side-by-side would force a horizontal
     scroll on the whole widget. */
  @media (max-width:34rem){ .mgrlist{flex-basis:100%;max-height:11rem} }
  .tedit{flex:1;min-width:6rem;accent-color:var(--accent);height:1.25rem}
  .tedit:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .tval{font-variant-numeric:tabular-nums;font-size:.78rem;width:2.6rem;text-align:right}
  .editbar{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-top:.75rem;
    padding-top:.75rem;border-top:1px solid var(--line)}
  .btn{font:inherit;font-size:.8rem;padding:.35rem .7rem;border-radius:.375rem;
    border:1px solid var(--line);background:var(--accent);color:var(--on-accent);cursor:pointer}
  .btn:disabled{opacity:.45;cursor:default}
  .btn.ghost{background:none;color:var(--sub)}
  .btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  /* Labels wrap instead of truncating, in a column wide enough to hold a real
     trait name. At .68rem in 5.6rem with nowrap+ellipsis these read
     "Metacognitive...", "Interrupt Reco...", "Fear Of Missin..." -- 10.88px
     text that also would not say which trait the bar belonged to. A label you
     cannot read is not a label. (2026-07-31) */
  .tname{font-size:.78rem;line-height:1.25;color:var(--sub);width:9rem;text-align:right;
    flex:0 0 auto;white-space:normal;overflow-wrap:break-word;hyphens:auto}
  .track{flex:1;height:16px;border-radius:999px;background:var(--raise);position:relative;overflow:hidden}
  .track .base{position:absolute;top:0;bottom:0;left:50%;width:1px;background:color-mix(in srgb,var(--ink) 22%,transparent);z-index:1}
  .track i{display:block;height:100%;border-radius:999px}
  .tval{font:.74rem/1 var(--mono);width:2.4rem;text-align:right;flex:0 0 auto;font-variant-numeric:tabular-nums}
  button.tname{background:none;border:0;padding:0;font:inherit;font-size:.78rem;line-height:1.25;
    color:var(--sub);cursor:help;text-align:right;white-space:normal;overflow-wrap:break-word;
    text-decoration:underline dotted currentColor;text-underline-offset:2px}
  /* Narrow viewports cannot afford 9rem of label AND a readable bar. */
  @media (max-width:30rem){
    .tname,button.tname{width:6.6rem;font-size:.72rem}
    .tval{width:2.1rem;font-size:.7rem}
  }
  button.tname:hover,button.tname:focus-visible{color:var(--ink)}
  button.tname:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}
  /* position:fixed, not absolute: the trait list sits inside scroll and
     details containers, and an absolutely positioned tip would be clipped by
     the first one with overflow set. */
  .tip{position:fixed;z-index:50;max-width:270px;padding:.55rem .65rem;border-radius:7px;
    background:#14171d;color:#f2f4f7;font-size:.76rem;line-height:1.45;
    box-shadow:0 6px 20px rgba(0,0,0,.3);pointer-events:none;opacity:0;transition:opacity 120ms ease}
  .tip.on{opacity:1}
  .tip b{display:block;font-size:.72rem;letter-spacing:.04em;text-transform:uppercase;
    color:#9fb4d8;margin-bottom:.2rem}
  .tip .ends{margin-top:.35rem;color:#aab4c2;font-size:.72rem}
  @media (prefers-reduced-motion:reduce){.tip{transition:none}}
  /* Banded scale. Each band is tinted by its own position on the same
     red-to-green ramp the persona meters use, so a value reads the same way in
     both views, and the active band is raised rather than recoloured -- moving
     the hue would break that correspondence. */
  /* Top margin is the marker's room. Without it the value label collides with
     the block heading above, and the tick ran the full height of the band and
     struck through the label it was pointing at. */
  .chain{margin:1rem 0}
  .chain .seg{display:flex;align-items:center;gap:.5rem;margin:.35rem 0}
  .chain .lbl{flex:0 0 9.5rem;font-size:.8rem;opacity:.85;text-align:right}
  .chain .track{flex:1;height:1.35rem;background:rgba(127,127,127,.16);border-radius:3px;position:relative;overflow:hidden}
  .chain .fill{height:100%;border-radius:3px}
  .chain .num{flex:0 0 3.6rem;font-size:.78rem;font-variant-numeric:tabular-nums;opacity:.8}
  .chain .seg.peak .lbl{font-weight:700;opacity:1}
  .chain .peaktag{font-size:.68rem;letter-spacing:.04em;text-transform:uppercase;padding:.05rem .3rem;border:1px solid currentColor;border-radius:3px;margin-left:.35rem}
  .chain button.seg{width:100%;background:none;border:0;padding:.1rem 0;font:inherit;color:inherit;cursor:pointer;border-radius:4px}
  .chain button.seg:hover .track,.chain button.seg:focus-visible .track{outline:2px solid var(--brand);outline-offset:2px}
  .chain button.seg:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
  .chain button.seg[aria-expanded="true"] .lbl{text-decoration:underline}
  /* --sub, not opacity: at .55 the tag measured 4.4:1 on a light host. */
  .chain .noov{flex:0 0 auto;font-size:.7rem;color:var(--sub);margin-left:.35rem}
  .ovpane{margin:.6rem 0 1rem;padding:.6rem;border:1px solid rgba(127,127,127,.28);border-radius:6px}
  .ovpane img{max-width:100%;height:auto;display:block;border-radius:4px}
  /* No opacity on the legend: at .8 it measured 3.59:1 on a light host. */
  .ovpane .cap{font-size:.8rem;margin:.45rem 0 0}
  @media (max-width:520px){
    /* The fixed 9.5rem label column took a third of a 393px viewport and left
       the bars as stubs — the one thing the block exists to show. Labels move
       above their track so the bar gets the full width. */
    .chain .seg{flex-wrap:wrap;row-gap:.15rem}
    .chain .lbl{flex:1 1 100%;text-align:left;font-size:.78rem}
    .chain .track{flex:1 1 auto;min-width:0}
    .chain .num{flex:0 0 3.2rem;text-align:right}
    .chain button.seg{text-align:left}
  }
  .amp{margin:1.1rem 0 .3rem;padding-top:.8rem;border-top:1px solid rgba(127,127,127,.22)}
  .amp .seg .lbl{flex:0 0 9.5rem}
  .ampnote{font-size:.8rem;opacity:.75;margin:.45rem 0 0}
  .scale{margin:1.5rem 0 .8rem}
  .bands{display:flex;gap:3px;position:relative}
  /* Inactive bands are dimmed through their fill's alpha, not opacity:
     opacity .42 dimmed the label with the fill, to 1.7-2.1:1. The active
     band's fill is the same in both themes, so its label is not --ink (light
     on an orange fill in dark) but whichever of near-black or near-white
     reads on that fill, chosen in levelsBlock. */
  .band{flex:1;height:30px;border-radius:5px;display:grid;place-items:center;
    font:.62rem/1 var(--mono);text-transform:uppercase;letter-spacing:.05em;
    color:var(--ink);
    border:2px solid transparent;overflow:hidden;white-space:nowrap;padding:0 .2rem}
  .band.on{border-color:var(--ink);font-weight:650}
  .marker{position:absolute;top:-17px;transform:translateX(-50%);font:600 .64rem/1 var(--mono);
    color:var(--ink);white-space:nowrap;pointer-events:none}
  /* Stops at the band's top edge rather than crossing it. */
  .marker::after{content:"";display:block;width:2px;height:7px;border-radius:1px;
    background:var(--ink);margin:3px auto 0}
  .behav{list-style:none;padding:0;margin:.6rem 0 0}
  .behav li{position:relative;padding:.22rem 0 .22rem .95rem;font-size:.86rem}
  .behav li::before{content:"";position:absolute;left:.15rem;top:.72rem;
    width:5px;height:5px;border-radius:50%;background:var(--accent)}
  .lvlname{font-size:.8rem;font-weight:600;margin:.7rem 0 0}
  .ovwrap{position:relative;display:block;max-width:100%;border:1px solid var(--line);
    border-radius:6px;overflow:hidden;background:var(--raise)}
  .ovwrap img{display:block;width:100%;height:auto}
  .bx{position:absolute;border:2px solid;border-radius:2px}
  .bxn{position:absolute;top:-9px;left:-9px;min-width:17px;height:17px;
    border-radius:9px;color:#fff;font-size:11px;font-weight:700;line-height:17px;
    text-align:center;padding:0 4px;box-sizing:border-box}
  .lg{list-style:none;display:flex;flex-wrap:wrap;gap:.7rem;padding:0;margin:.5rem 0 0;font-size:.76rem}
  .lg li{display:flex;align-items:center;gap:.35rem;color:var(--sub)}
  .lgnote{font-size:.72rem;color:var(--sub);margin:.35rem 0 0;opacity:.85}
  .fmeta{display:flex;align-items:center;gap:.35rem}
  /* Outlined, not filled. This read color:var(--bg) -- and --bg is defined
     nowhere in this stylesheet, so the declaration was invalid at computed-
     value time and the colour fell back to inherited: dark text on the
     mid-dark --sub fill, in both themes. There is no --bg to define, either:
     the widget body is transparent and sits on the host's background, so the
     only foreground guaranteed to contrast is the one the body already uses.
     Text is --ink on the page itself, which is exactly that. (2026-07-31) */
  .fnum{min-width:17px;height:17px;border-radius:9px;
    background:transparent;color:var(--ink);border:1px solid var(--line);
    font-size:11px;font-weight:700;line-height:15px;text-align:center;
    padding:0 4px;box-sizing:border-box;flex:none}
  .tabs{display:flex;flex-wrap:wrap;gap:.3rem;margin:0 0 .7rem;padding:0;border-bottom:1px solid var(--line)}
  .tab{background:none;border:0;border-bottom:2px solid transparent;padding:.35rem .6rem;
    font:inherit;font-size:.8rem;color:var(--sub);cursor:pointer;border-radius:4px 4px 0 0;
    display:flex;align-items:center;gap:.4rem;max-width:100%;overflow-wrap:anywhere;text-align:left}
  .tab:hover{color:var(--ink)}
  .tab[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--accent);font-weight:600}
  .tab:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .tabn{font:.68rem/1 var(--mono);color:var(--sub);background:var(--raise);
    border-radius:999px;padding:.15rem .35rem;flex:none}
  .tab[aria-selected="true"] .tabn{color:var(--ink)}
  .sw{width:11px;height:11px;border-radius:2px;display:inline-block}
  .offlist{margin:.6rem 0 0;padding:0;list-style:none;font-size:.8rem}
  .offlist li{padding:.18rem 0;color:var(--sub)}
  .shot{max-width:100%;height:auto;display:block;border-radius:6px;border:1px solid var(--line)}
  .cap{font-size:.77rem;color:var(--sub);margin:.35rem 0 0}
  /* Provenance: what an answer's numbers rest on. Status is named in text on
     every row and chip; the colour of a swatch repeats it and never carries
     it alone (WCAG 1.4.1). Chip text is the status hue mixed into --ink, the
     same construction the severity chips use, so it follows the theme. */
  .prov{font-size:.8rem;line-height:1.45;color:var(--sub);margin:.15rem 0 0}
  .prov b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
  .pint{margin:0 0 .6rem;font-size:.85rem}
  .pint b{font-variant-numeric:tabular-nums}
  .pstack{display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--raise);margin:.2rem 0 .5rem}
  .pstack i{display:block;height:100%}
  .pcounts{list-style:none;padding:0;margin:0 0 .6rem}
  .pcounts li{display:grid;grid-template-columns:auto 2.4rem 1fr;gap:.15rem .6rem;align-items:baseline;
    padding:.32rem 0;border-bottom:1px solid color-mix(in srgb,var(--line) 55%,transparent)}
  .pcounts li:last-child{border-bottom:0}
  .pnum{font:.82rem/1 var(--mono);text-align:right;font-variant-numeric:tabular-nums}
  .pmean{font-size:.8rem;color:var(--sub)}
  @media (max-width:30rem){
    .pcounts li{grid-template-columns:auto 1fr}
    .pcounts .pnum{text-align:left}
    .pcounts .pmean{grid-column:1/-1}
  }
  .pchip{display:inline-flex;align-items:center;gap:.3rem;font:650 .64rem/1.2 var(--mono);letter-spacing:.05em;
    text-transform:uppercase;padding:.16rem .38rem;border-radius:3px;white-space:nowrap;
    background:var(--raise);color:var(--ink)}
  .pchip .sw{width:8px;height:8px}
  .pchip.hypothesis{background:color-mix(in srgb,var(--warn) 20%,transparent);color:color-mix(in srgb,var(--warn) 62%,var(--ink))}
  .pchip.fitted{background:color-mix(in srgb,var(--ok) 20%,transparent);color:color-mix(in srgb,var(--ok) 55%,var(--ink))}
  .pchip.published{background:color-mix(in srgb,var(--brand) 18%,transparent);color:color-mix(in srgb,var(--brand) 70%,var(--ink))}
  .pchip.definition,.pchip.mixed{background:var(--raise);color:var(--ink)}
  .pchip.custom{background:color-mix(in srgb,var(--brand-2) 20%,transparent);color:color-mix(in srgb,var(--brand-2) 55%,var(--ink))}
  .psw-fitted{background:var(--ok)} .psw-published{background:var(--brand)}
  .psw-definition{background:color-mix(in srgb,var(--ink) 35%,transparent)} .psw-hypothesis{background:var(--warn)}
  .pscope{font-size:.79rem;color:var(--sub);margin:.4rem 0 0}
  details.pids{margin:.6rem 0 0}
  details.pids>summary{cursor:pointer;font-size:.8rem;color:var(--ink);padding:.25rem 0}
  details.pids>summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}
  .pgrp{font:600 .72rem/1.3 var(--mono);color:var(--sub);margin:.55rem 0 .2rem}
  .pidl{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:.2rem .35rem}
  .pidl li{font:.7rem/1.35 var(--mono);color:var(--ink);background:var(--raise);border-radius:3px;
    padding:.08rem .3rem;overflow-wrap:anywhere;max-width:100%}
  /* Trait rows that carry a status: one fixed slot after the value on every
     row, so the tracks stay aligned whether or not a row is marked. */
  .pstatus{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem .5rem;margin:0 0 .55rem;font-size:.79rem;color:var(--sub)}
  .pstatus .pchip{flex:0 0 auto}
  .pstatus span.ptext{flex:1 1 14rem;min-width:0}
  .pslot{flex:0 0 4.4rem;display:flex;justify-content:flex-start}
  .ptag{font:650 .6rem/1.2 var(--mono);letter-spacing:.05em;text-transform:uppercase;padding:.14rem .3rem;
    border-radius:3px;border:1px solid var(--line);background:none;color:var(--ink);white-space:nowrap}
  button.ptag{cursor:help;text-decoration:underline dotted currentColor;text-underline-offset:2px}
  button.ptag:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  @media (max-width:30rem){ .pslot{flex-basis:4.1rem} }
  .foot{padding:0 18px 14px;font-size:.77rem;color:var(--sub)}
  .msg{padding:16px 18px;font-size:.85rem;color:var(--sub)}
  @media (max-width:420px){
    .hero{padding:14px 18px 13px}
    .health{letter-spacing:.06em}
  }
  @media (prefers-reduced-motion:reduce){.chev,.stitle{transition:none}}
`;

/**
 * Shared runtime.
 *
 * Interprets the spec against structuredContent. Every value is written with
 * textContent and never innerHTML: views are hydrated from tool output that
 * contains strings this server does not control -- paths, page titles, audit
 * findings scraped off third-party sites -- and interpolating those into
 * markup is how a status panel becomes an injection sink.
 */
const RUNTIME = String.raw`
(async () => {
  var SPEC = __SPEC__;
  var LOGO = "__LOGO__";
  var msg = document.getElementById("msg");
  var root = document.getElementById("root");
  if (!globalThis.ExtApps) { msg.textContent = "Widget runtime unavailable."; return; }
  var App = globalThis.ExtApps.App;
  var applyHostStyleVariables = globalThis.ExtApps.applyHostStyleVariables;
  var app = new App({ name: SPEC.id, version: "1.0.0" }, {}, { autoResize: true });

  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  var at = function (obj, path) {
    if (!path) return undefined;
    return path.split(".").reduce(function (o, k) {
      return (o === null || o === undefined) ? undefined : o[k];
    }, obj);
  };
  var isObjArray = function (v) {
    return Array.isArray(v) && v.length > 0 &&
      v.every(function (x) { return x && typeof x === "object" && !Array.isArray(x); });
  };
  // Floating-point residue is not precision. computeTimeMs arrived as
  // 574.0467359999966 and attentionMismatch as 0.300375; the trailing digits
  // are artefacts of binary floating point, and printing them implies a
  // confidence the measurement does not have. Trait values like 0.25 and
  // integers are untouched.
  var num = function (n) {
    if (!isFinite(n)) return String(n);
    if (Number.isInteger(n)) return String(n);
    return String(Math.round(n * 1e4) / 1e4);
  };
  var fmt = function (v) {
    if (v === true) return "yes";
    if (v === false) return "no";
    if (typeof v === "number") return num(v);
    if (v === "" || v === null || v === undefined) return "—";
    if (Array.isArray(v)) {
      // An array of records has no useful join; String() on it yields a row of
      // "[object Object]" separated by commas.
      if (isObjArray(v)) return v.length + (v.length === 1 ? " entry" : " entries");
      return v.length ? v.join(", ") : "—";
    }
    // Backstop for an object that reached a cell. Naming its fields beats both
    // "[object Object]" (says nothing) and a raw JSON dump (says everything,
    // illegibly, and blows the column width out). The empathy per-persona
    // table carried six such columns -- perceptualTransport, scoreContext,
    // cognitiveLoad and friends -- each printing serialised JSON into a table
    // cell. (2026-07-31)
    if (typeof v === "object") {
      try {
        var keys = Object.keys(v);
        if (!keys.length) return "—";
        var shown = keys.slice(0, 3).map(titleize).join(", ");
        return keys.length > 3 ? shown + " +" + (keys.length - 3) + " more" : shown;
      } catch (_) { return "(unreadable)"; }
    }
    return String(v);
  };
  var titleize = function (k) {
    return k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, function (c) { return c.toUpperCase(); });
  };
  var used = {};
  var GLOSSARY = __GLOSSARY__;

  // One tip element reused by every label, created lazily.
  var tip = null;
  function ensureTip() {
    if (tip) return tip;
    tip = el("div", "tip");
    tip.id = "kit-tip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
    return tip;
  }
  function showTip(btn, info) {
    var t = ensureTip();
    t.replaceChildren();
    t.appendChild(el("b", null, info.label));
    t.appendChild(document.createTextNode(info.description || ""));
    if (info.lowEnd || info.highEnd) {
      var e = el("div", "ends");
      if (info.lowEnd) e.appendChild(el("div", null, "0.0 — " + info.lowEnd));
      if (info.highEnd) e.appendChild(el("div", null, "1.0 — " + info.highEnd));
      t.appendChild(e);
    }
    t.classList.add("on");
    var r = btn.getBoundingClientRect();
    var tr = t.getBoundingClientRect();
    // Flip below when there is not room above, and clamp horizontally so the
    // tip never leaves the frame.
    var top = r.top - tr.height - 8;
    if (top < 4) top = r.bottom + 8;
    var left = Math.min(Math.max(4, r.left), Math.max(4, window.innerWidth - tr.width - 4));
    t.style.top = top + "px";
    t.style.left = left + "px";
  }
  function hideTip() { if (tip) tip.classList.remove("on"); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") hideTip(); });

  /**
   * Flatten an object into label/value pairs, following nested objects.
   *
   * kv and rest previously descended exactly one level, so anything deeper
   * reached fmt() as an object and rendered "[object Object]" -- scoreContext
   * is several levels deep, and every branch of it came out as that string.
   *
   * Arrays of records are left intact for the caller to table; arrays of
   * scalars join. Depth-limited so a cyclic or pathological payload cannot
   * hang the view, and the cutoff is reported rather than silently truncating.
   */
  function flattenPairs(obj, prefix, out, depth) {
    out = out || [];
    depth = depth === undefined ? 4 : depth;
    Object.keys(obj || {}).forEach(function (k) {
      var v = obj[k];
      var label = prefix ? prefix + " › " + titleize(k) : titleize(k);
      if (v && typeof v === "object" && !Array.isArray(v)) {
        if (depth > 0) flattenPairs(v, label, out, depth - 1);
        else out.push([label, "(nested further)"]);
      } else if (isObjArray(v)) {
        out.push([label, v.length + (v.length === 1 ? " entry" : " entries")]);
      } else {
        out.push([label, v]);
      }
    });
    return out;
  }

  function kvTable(pairs) {
    var t = el("table", "kv"), tb = el("tbody");
    pairs.forEach(function (p) {
      var tr = el("tr");
      tr.appendChild(el("th", null, p[0]));
      var td = el("td");
      if (/^\//.test(String(p[1]))) td.className = "path";
      td.textContent = fmt(p[1]);
      tr.appendChild(td); tb.appendChild(tr);
    });
    t.appendChild(tb); return t;
  }

  function gridTable(rows, only) {
    var cols = [];
    if (only && only.length) {
      // Keep only columns that at least one row actually carries, so a spec
      // naming an optional field does not produce a column of dashes.
      only.forEach(function (k) {
        if (rows.some(function (r) { return r[k] !== undefined; })) cols.push(k);
      });
    } else {
      rows.forEach(function (r) {
        Object.keys(r).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); });
      });
    }
    var t = el("table", "grid"), thead = el("thead"), htr = el("tr");
    cols.forEach(function (c) { htr.appendChild(el("th", null, c)); });
    thead.appendChild(htr);
    var tb = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr");
      cols.forEach(function (c) {
        var v = r[c], td = el("td");
        if (typeof v === "boolean") td.appendChild(el("span", "chip" + (v ? "" : " no"), v ? "yes" : "no"));
        else if (typeof v === "number") { td.className = "num"; td.textContent = num(v); }
        else if (/path/i.test(c) || /^\//.test(String(v))) { td.className = "path"; td.textContent = fmt(v); }
        else td.textContent = fmt(v);
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(thead); t.appendChild(tb);
    var box = el("div", "scroll"); box.appendChild(t); return box;
  }

  // Two vocabularies, because the tools genuinely use two. Bug hunting emits
  // critical/high/medium/low; the accessibility audit emits major/minor. An
  // unrecognised severity sorts last and renders in the low style, so omitting
  // major/minor would have shown every accessibility barrier as least-severe
  // -- the opposite of what an audit is for.
  var SEV_ORDER = {
    critical: 0, blocker: 0,
    high: 1, major: 1, serious: 1,
    medium: 2, moderate: 2,
    low: 3, minor: 3,
    info: 4, notice: 4,
  };
  function findingsList(rows, b) {
    var sorted = rows.slice().sort(function (x, y) {
      var a = SEV_ORDER[String(x[b.severityKey] || "").toLowerCase()];
      var c = SEV_ORDER[String(y[b.severityKey] || "").toLowerCase()];
      return (a === undefined ? 9 : a) - (c === undefined ? 9 : c);
    });
    var ul = el("ul", "finds");
    sorted.forEach(function (r) {
      var li = el("li");
      var sev = String(r[b.severityKey] || "").toLowerCase();
      // Number and severity travel together as ONE grid child. Appending the
      // number as a third child put it in a column sized by the description
      // text on the next row, so the badge stretched into a full-width bar.
      var meta = el("span", "fmeta");
      // The number drawn on this finding's boxes in the overlay above.
      if (r.finding) meta.appendChild(el("span", "fnum", String(r.finding)));
      meta.appendChild(el("span", "sev " + (SEV_ORDER[sev] !== undefined ? sev : "low"), sev || "note"));
      li.appendChild(meta);
      li.appendChild(el("span", null, fmt(r[b.textKey])));
      if (b.detailKey && r[b.detailKey]) li.appendChild(el("p", "fdetail", fmt(r[b.detailKey])));
      ul.appendChild(li);
    });
    return ul;
  }

  /**
   * Editable trait sliders that write back through the server.
   *
   * The widget sandbox has no network of its own -- it cannot POST anywhere --
   * but app.callServerTool reaches the MCP server that rendered it, which is
   * the same channel the image blocks already use to fetch artifacts. So an
   * editor is possible here without any new transport.
   *
   * Save is explicit rather than live-on-drag. Every drag would otherwise be a
   * write to two stores, and a slider dragged across its range would produce a
   * dozen persona versions of which only the last was meant.
   */
  function editorBlock(rows, b, data, prov) {
    var wrap = el("div", "traits");
    if (prov) wrap.appendChild(traitStatusLine(prov));
    var personaName = at(data, b.personaField || "persona") || at(data, "persona_name");
    var edited = {};
    var controls = [];

    rows.forEach(function (r) {
      var name = String(r.name), v = Number(r.value);
      if (!isFinite(v)) return;
      var line = el("div", "trait");
      var label = el("span", "tname", titleize(name));
      var input = document.createElement("input");
      input.type = "range"; input.min = "0"; input.max = "1"; input.step = "0.05";
      input.value = String(v); input.className = "tedit";
      input.setAttribute("aria-label", titleize(name));
      var out = el("span", "tval", v.toFixed(2));
      // The original stays visible next to the new value: an editor that hides
      // what you started from makes "did I mean to move that?" unanswerable.
      var orig = el("span", "cap", " was " + v.toFixed(2));
      orig.style.display = "none";
      input.addEventListener("input", function () {
        var nv = Number(input.value);
        out.textContent = nv.toFixed(2);
        if (Math.abs(nv - v) < 1e-9) { delete edited[name]; orig.style.display = "none"; line.classList.remove("dirty"); }
        else { edited[name] = nv; orig.style.display = ""; line.classList.add("dirty"); }
        status.textContent = Object.keys(edited).length
          ? Object.keys(edited).length + " unsaved change(s)" : "";
        save.disabled = !Object.keys(edited).length;
      });
      line.appendChild(label); line.appendChild(input); line.appendChild(out);
      if (prov) line.appendChild(traitTag(prov, name));
      line.appendChild(orig);
      wrap.appendChild(line);
      controls.push({ name: name, input: input, out: out, base: v });
    });

    var bar = el("div", "editbar");
    var save = el("button", "btn", "Save changes");
    save.type = "button"; save.disabled = true;
    var reset = el("button", "btn ghost", "Reset");
    reset.type = "button";
    var status = el("span", "cap", "");
    bar.appendChild(save); bar.appendChild(reset); bar.appendChild(status);
    wrap.appendChild(bar);

    reset.addEventListener("click", function () {
      controls.forEach(function (c) {
        c.input.value = String(c.base); c.out.textContent = c.base.toFixed(2);
        c.input.parentNode.classList.remove("dirty");
        c.input.parentNode.querySelectorAll(".cap").forEach(function (n) { n.style.display = "none"; });
      });
      edited = {}; status.textContent = ""; save.disabled = true;
    });

    save.addEventListener("click", async function () {
      if (!personaName) { status.textContent = "No persona name in this result — cannot save."; return; }
      save.disabled = true; status.textContent = "Saving…";
      try {
        var res = await app.callServerTool({
          name: b.saveTool || "persona_update",
          arguments: { persona_name: personaName, traits: edited },
        });
        var txt = ((res && res.content) || []).filter(function (c) { return c.type === "text"; })[0];
        var out = txt ? JSON.parse(txt.text) : {};
        if (out.error) { status.textContent = "Not saved: " + (out.message || out.error); save.disabled = false; return; }
        // The drift check comes back with the save, so the moment a trait edit
        // contradicts the description is the moment it is said -- not the next
        // time somebody happens to look.
        var drift = (out.descriptionDrift || []).length;
        status.textContent = "Saved. " + (out.changed || []).length + " field(s) changed"
          + (drift ? " — " + drift + " description claim(s) now contradicted" : "")
          + (out.stores && out.stores.cms !== "written" ? " — CMS NOT written" : "");
        controls.forEach(function (c) {
          if (edited[c.name] !== undefined) { c.base = edited[c.name]; }
          c.input.parentNode.classList.remove("dirty");
        });
        edited = {};
        // Tell the conversation, so the model knows the persona moved under it
        // rather than answering later from the values it was handed.
        app.sendMessage({ role: "user", content: [{ type: "text",
          text: "Updated persona " + personaName + " — " + (out.changed || []).join(", ")
            + (drift ? ". Description now contradicts: " + out.descriptionDrift.map(function (d) { return d.trait; }).join(", ") : "") }] });
      } catch (e) {
        status.textContent = "Save failed: " + (e && e.message ? e.message : e);
        save.disabled = false;
      }
    });
    return wrap;
  }

  /**
   * The whole persona CRUD surface in one block.
   *
   * A roster on the left, the selected persona's editable traits on the right,
   * and save / delete / new. Every write goes out through app.callServerTool to
   * the tools that already do the work -- persona_update, persona_delete,
   * persona_create_submit_traits -- so this is a surface over them rather than
   * a second implementation of them. That matters: a duplicate write path is
   * the exact defect that has produced nine divergent tool families here.
   *
   * The roster ships with the result, so switching personas is instant and
   * costs no round trip. Only writes go back to the server.
   */
  function managerBlock(data, b) {
    var wrap = el("div", "mgr");
    var roster = at(data, b.field) || [];
    if (!roster.length) return wrap;
    var selected = roster[0];
    var edited = {};

    var cols = el("div", "mgrcols");
    var list = el("div", "mgrlist");
    var pane = el("div", "mgrpane");
    cols.appendChild(list); cols.appendChild(pane);
    wrap.appendChild(cols);

    var status = el("p", "cap", "");
    wrap.appendChild(status);

    function renderList() {
      list.innerHTML = "";
      roster.forEach(function (p, i) {
        var row = el("button", "mgrrow" + (p === selected ? " on" : ""), "");
        row.type = "button";
        row.setAttribute("aria-pressed", p === selected ? "true" : "false");
        row.appendChild(el("span", "mgrname", String(p.name || "(unnamed)")));
        var meta = [];
        if (p.builtin) meta.push("built-in");
        // Where the values come from, on the row that picks the persona.
        if (p.provenance && p.provenance.label) meta.push(String(p.provenance.label));
        if (p.valuesRoute) meta.push(String(p.valuesRoute));
        if (meta.length) row.appendChild(el("span", "cap", meta.join(" · ")));
        row.addEventListener("click", function () {
          if (Object.keys(edited).length &&
              !confirm("Discard " + Object.keys(edited).length + " unsaved change(s)?")) return;
          selected = p; edited = {}; renderList(); renderPane();
        });
        list.appendChild(row);
      });
    }

    function renderPane() {
      pane.innerHTML = "";
      var p = selected;
      pane.appendChild(el("h3", "mgrh", String(p.name)));
      if (p.description) pane.appendChild(el("p", "cap", String(p.description)));

      var traits = p.traits || {};
      var names = Object.keys(traits);
      var box = el("div", "traits");
      var prov = p.provenance && p.provenance.status ? p.provenance : null;
      if (prov) box.appendChild(traitStatusLine(prov));
      names.forEach(function (k) {
        var v = Number(traits[k]);
        if (!isFinite(v)) return;
        var line = el("div", "trait");
        line.appendChild(el("span", "tname", titleize(k)));
        var input = document.createElement("input");
        input.type = "range"; input.min = "0"; input.max = "1"; input.step = "0.05";
        input.value = String(v); input.className = "tedit";
        input.setAttribute("aria-label", titleize(k));
        var out = el("span", "tval", v.toFixed(2));
        input.addEventListener("input", function () {
          var nv = Number(input.value);
          out.textContent = nv.toFixed(2);
          if (Math.abs(nv - v) < 1e-9) { delete edited[k]; line.classList.remove("dirty"); }
          else { edited[k] = nv; line.classList.add("dirty"); }
          save.disabled = !Object.keys(edited).length;
          status.textContent = Object.keys(edited).length
            ? Object.keys(edited).length + " unsaved change(s) on " + p.name : "";
        });
        line.appendChild(input); line.appendChild(out);
        if (prov) line.appendChild(traitTag(prov, k));
        box.appendChild(line);
      });
      pane.appendChild(box);

      var bar = el("div", "editbar");
      var save = el("button", "btn", "Save");
      save.type = "button"; save.disabled = true;
      var del = el("button", "btn ghost", "Delete");
      del.type = "button";
      // A built-in is shared by every install; the server refuses to edit or
      // delete one, so the UI does not offer to.
      if (p.builtin) { save.disabled = true; del.disabled = true; }
      bar.appendChild(save); bar.appendChild(del);
      // The same three routes on update: revise from a new description,
      // re-answer the survey, or supply a Big Five profile. Which fields are
      // meaningful depends entirely on which route you are taking.
      var via = el("button", "btn ghost", "Update via…");
      via.type = "button";
      via.disabled = !!p.builtin;
      via.addEventListener("click", function () { renderForm("description", p); });
      bar.appendChild(via);
      pane.appendChild(bar);

      save.addEventListener("click", async function () {
        save.disabled = true; status.textContent = "Saving…";
        try {
          var res = await app.callServerTool({ name: "persona_update",
            arguments: { persona_name: p.name, traits: edited } });
          var t = ((res && res.content) || []).filter(function (c) { return c.type === "text"; })[0];
          var out = t ? JSON.parse(t.text) : {};
          if (out.error) { status.textContent = "Not saved: " + (out.message || out.error); save.disabled = false; return; }
          Object.keys(edited).forEach(function (k) { p.traits[k] = edited[k]; });
          var drift = (out.descriptionDrift || []).length;
          status.textContent = "Saved " + p.name + ". " + (out.changed || []).length + " field(s)"
            + (drift ? " — " + drift + " description claim(s) now contradicted" : "")
            + (out.stores && out.stores.cms !== "written" ? " — CMS NOT written" : "");
          edited = {}; renderPane();
          app.sendMessage({ role: "user", content: [{ type: "text",
            text: "Updated persona " + p.name + ": " + (out.changed || []).join(", ") }] });
        } catch (e) { status.textContent = "Save failed: " + (e && e.message ? e.message : e); save.disabled = false; }
      });

      del.addEventListener("click", async function () {
        if (!confirm("Delete " + p.name + " from both stores? This cannot be undone here.")) return;
        del.disabled = true; status.textContent = "Deleting…";
        try {
          var res = await app.callServerTool({ name: "persona_delete",
            arguments: { persona_name: p.name, confirm: true } });
          var t = ((res && res.content) || []).filter(function (c) { return c.type === "text"; })[0];
          var out = t ? JSON.parse(t.text) : {};
          if (out.error) { status.textContent = "Not deleted: " + (out.message || out.error); del.disabled = false; return; }
          roster = roster.filter(function (x) { return x !== p; });
          status.textContent = "Deleted " + p.name + ". " + (out.note || "");
          app.sendMessage({ role: "user", content: [{ type: "text", text: "Deleted persona " + p.name }] });
          if (!roster.length) { pane.innerHTML = ""; list.innerHTML = ""; return; }
          selected = roster[0]; edited = {}; renderList(); renderPane();
        } catch (e) { status.textContent = "Delete failed: " + (e && e.message ? e.message : e); del.disabled = false; }
      });
    }

    /**
     * Create / update in three modes, because a persona's values come from one
     * of three routes and the route decides which fields are even meaningful.
     * A single form with every field would ask for a Big Five profile and a
     * survey and a description at once, when supplying any ONE of them is the
     * whole job.
     */
    function renderForm(mode, existing) {
      pane.innerHTML = "";
      var modes = data.modes || {};
      var spec = modes[mode] || {};
      var isUpdate = !!existing;

      var tabs = el("div", "modetabs");
      ["description", "survey", "bigfive"].forEach(function (m) {
        var t = el("button", "modetab" + (m === mode ? " on" : ""), (modes[m] && modes[m].label) || m);
        t.type = "button";
        t.setAttribute("aria-pressed", m === mode ? "true" : "false");
        t.addEventListener("click", function () { renderForm(m, existing); });
        tabs.appendChild(t);
      });
      pane.appendChild(el("h3", "mgrh", isUpdate ? "Update " + existing.name : "New persona"));
      pane.appendChild(tabs);
      if (spec.note) pane.appendChild(el("p", "cap", spec.note));

      var nameIn;
      if (!isUpdate) {
        nameIn = document.createElement("input");
        nameIn.type = "text"; nameIn.className = "tin"; nameIn.placeholder = "persona name";
        nameIn.setAttribute("aria-label", "Persona name");
        pane.appendChild(nameIn);
      }

      var fields = el("div", "fields");
      pane.appendChild(fields);
      var collect = function () { return {}; };

      if (mode === "description") {
        var ta = document.createElement("textarea");
        ta.className = "tin"; ta.rows = 5;
        ta.placeholder = "A cautious retiree who double-checks everything before buying…";
        ta.value = isUpdate ? String(existing.description || "") : "";
        ta.setAttribute("aria-label", "Description");
        fields.appendChild(ta);
        collect = function () { return { description: ta.value.trim() }; };
      } else if (mode === "survey") {
        var criteria = data.traitCriteria || {};
        var names = data.allTraits || Object.keys(criteria);
        var vals = {};
        names.forEach(function (k) {
          var base = isUpdate && existing.traits && typeof existing.traits[k] === "number"
            ? Number(existing.traits[k]) : 0.5;
          vals[k] = base;
          var line = el("div", "trait");
          var lab = el("span", "tname", titleize(k));
          if (criteria[k]) lab.title = criteria[k];
          var input = document.createElement("input");
          input.type = "range"; input.min = "0"; input.max = "1"; input.step = "0.05";
          input.value = String(base); input.className = "tedit";
          input.setAttribute("aria-label", titleize(k));
          var out = el("span", "tval", base.toFixed(2));
          input.addEventListener("input", function () {
            vals[k] = Number(input.value); out.textContent = vals[k].toFixed(2);
          });
          line.appendChild(lab); line.appendChild(input); line.appendChild(out);
          fields.appendChild(line);
        });
        collect = function () { return { answers: vals }; };
      } else {
        var bf = {};
        (data.bigFiveFactors || []).forEach(function (f) {
          var base = isUpdate && existing.bigFive && typeof existing.bigFive[f.factor] === "number"
            ? Number(existing.bigFive[f.factor]) : 0.5;
          bf[f.factor] = base;
          var line = el("div", "trait");
          var lab = el("span", "tname", titleize(f.factor));
          lab.title = "low: " + f.low + "\nhigh: " + f.high + "\n" + (f.doNotConfuse || "");
          var input = document.createElement("input");
          input.type = "range"; input.min = "0"; input.max = "1"; input.step = "0.01";
          input.value = String(base); input.className = "tedit";
          input.setAttribute("aria-label", titleize(f.factor));
          var out = el("span", "tval", base.toFixed(2));
          input.addEventListener("input", function () {
            bf[f.factor] = Number(input.value); out.textContent = bf[f.factor].toFixed(2);
          });
          line.appendChild(lab); line.appendChild(input); line.appendChild(out);
          fields.appendChild(line);
        });
        collect = function () { return { bigFive: bf }; };
      }

      var bar = el("div", "editbar");
      var go = el("button", "btn", isUpdate ? "Apply" : "Create");
      go.type = "button";
      var back = el("button", "btn ghost", "Cancel");
      back.type = "button";
      back.addEventListener("click", function () { renderPane(); });
      bar.appendChild(go); bar.appendChild(back);
      pane.appendChild(bar);

      go.addEventListener("click", async function () {
        var name = isUpdate ? existing.name : (nameIn.value || "").trim();
        if (!name) { status.textContent = "A name is required."; return; }
        var payload = collect();
        go.disabled = true; status.textContent = "Working…";
        try {
          if (mode === "description") {
            // Handed to the conversation rather than faked. The widget has no
            // model, and a form that silently did nothing would be worse than
            // one that says where the work happens.
            app.sendMessage({ role: "user", content: [{ type: "text",
              text: (isUpdate ? "Update the persona " + name + " from this description" : "Create a persona named " + name + " from this description")
                + ", using persona_create_from_description and the completeness contract: " + payload.description }] });
            status.textContent = "Handed to the assistant — it will infer the traits and write the persona.";
            go.disabled = false;
            return;
          }
          var res, out, t;
          if (isUpdate) {
            res = await app.callServerTool({ name: "persona_update",
              arguments: mode === "survey"
                ? { persona_name: name, traits: payload.answers }
                : { persona_name: name, bigFive: payload.bigFive } });
          } else if (mode === "survey") {
            res = await app.callServerTool({ name: "persona_questionnaire_build",
              arguments: { name: name, description: "Created from a survey in persona_manager", answers: payload.answers, save: true } });
          } else {
            // Two calls, both real: build establishes the persona, update
            // attaches the Big Five and moves it to that values route.
            await app.callServerTool({ name: "persona_questionnaire_build",
              arguments: { name: name, description: "Created from a Big Five profile in persona_manager", answers: {}, save: true } });
            res = await app.callServerTool({ name: "persona_update",
              arguments: { persona_name: name, bigFive: payload.bigFive } });
          }
          t = ((res && res.content) || []).filter(function (c) { return c.type === "text"; })[0];
          out = t ? JSON.parse(t.text) : {};
          if (out.error) { status.textContent = "Failed: " + (out.message || out.error); go.disabled = false; return; }
          status.textContent = (isUpdate ? "Updated " : "Created ") + name
            + (out.valuesRoute ? " (" + out.valuesRoute + ")" : "")
            + ((out.descriptionDrift || []).length ? " — " + out.descriptionDrift.length + " description claim(s) now contradicted" : "");
          app.sendMessage({ role: "user", content: [{ type: "text",
            text: (isUpdate ? "Updated" : "Created") + " persona " + name + " via " + mode }] });
          renderPane();
        } catch (e) {
          status.textContent = "Failed: " + (e && e.message ? e.message : e);
          go.disabled = false;
        }
      });
    }

    var newBar = el("div", "editbar");
    var newBtn = el("button", "btn", "New persona");
    newBtn.type = "button";
    newBtn.addEventListener("click", function () { renderForm("description", null); });
    newBar.appendChild(newBtn);
    wrap.insertBefore(newBar, status);

    renderList(); renderPane();
    return wrap;
  }

  function traitsBlock(rows, b, prov) {
    var wrap = el("div", "traits");
    if (prov) wrap.appendChild(traitStatusLine(prov));
    rows.forEach(function (r) {
      var name = r.name, v = Number(r.value);
      if (!isFinite(v)) return;
      var line = el("div", "trait");
      var label = titleize(String(name));
      var info = b.describe ? GLOSSARY[String(name)] : null;
      if (info) {
        // A button, not a span: the definition has to be reachable by keyboard,
        // and hover-only would hide it from anyone not using a mouse.
        var btn = el("button", "tname", label);
        btn.type = "button";
        btn.setAttribute("aria-describedby", "kit-tip");
        var payload = { label: label, description: info.d, lowEnd: info.l, highEnd: info.h };
        btn.addEventListener("mouseenter", function () { showTip(btn, payload); });
        btn.addEventListener("focus", function () { showTip(btn, payload); });
        btn.addEventListener("mouseleave", hideTip);
        btn.addEventListener("blur", hideTip);
        line.appendChild(btn);
      } else {
        line.appendChild(el("span", "tname", label));
      }
      var track = el("div", "track");
      track.appendChild(el("span", "base"));
      var fill = el("i");
      var pct = Math.max(0, Math.min(1, v)) * 100;
      fill.style.width = pct + "%";
      fill.style.backgroundColor =
        b.ramp === "value" ? "hsl(" + (220 + v * 80) + ", 55%, 55%)"
        : b.ramp === "accessibility" ? "hsl(" + (55 - v * 30) + ", 78%, 50%)"
        : "hsl(" + (v * 120) + ", 65%, 50%)";
      track.appendChild(fill);
      line.appendChild(track);
      line.appendChild(el("span", "tval", v.toFixed(2)));
      if (prov) line.appendChild(traitTag(prov, String(name)));
      wrap.appendChild(line);
    });
    return wrap;
  }

  // Traits arrive either as {name: number} or as [{name, value}]; both are in
  // use across the persona tools, so both are accepted rather than forcing a
  // shape the callers do not already produce.
  function normaliseTraits(v, b) {
    if (isObjArray(v)) {
      return v.map(function (r) {
        return { name: r[b.nameKey || "name"] || r.trait || r.key,
                 value: r[b.valueKey || "value"] !== undefined ? r[b.valueKey || "value"] : r.score };
      });
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v).filter(function (k) { return typeof v[k] === "number"; })
        .map(function (k) { return { name: k, value: v[k] }; });
    }
    return [];
  }

  // One sentence from an object: the template for the value of its by key
  // ("*" the fallback), with {key} filled from the object. A perceptual
  // profile is {resolution, name}, and "default (default)" says nothing that
  // "none: the generic default" does not say better.
  function fillTemplate(obj, by, templates) {
    if (!obj || typeof obj !== "object" || !templates) return null;
    var key = by ? String(obj[by]) : "*";
    var t = Object.prototype.hasOwnProperty.call(templates, key) ? templates[key] : templates["*"];
    if (typeof t !== "string") return null;
    return t.replace(/\{(\w+)\}/g, function (_m, k) {
      return obj[k] === undefined || obj[k] === null ? "" : String(obj[k]);
    });
  }

  // What an answer's numbers rest on (model-provenance.ts). The statuses in
  // reading order, from what data or the literature backs to what is set by
  // hand, each with what the registry means by it. Through 21.0 the views
  // drew these answers' numbers bare, and the summary fell into the rest dump
  // with its hypothesis ids printed as one joined string.
  var PROV_ORDER = ["fitted", "published", "definition", "hypothesis"];
  var PROV_MEANING = {
    fitted: "estimated from named data, with a held-out score",
    published: "taken from a cited law or measurement in the literature",
    definition: "a choice of units, scale or encoding; no empirical claim",
    hypothesis: "set by hand; nothing in data or the literature backs the value yet",
  };
  var PROV_PHRASE = {
    fitted: "fitted to data", published: "published",
    definition: "definitions", hypothesis: "set by hand (hypotheses)",
  };
  function isProvenance(p) {
    return !!(p && typeof p === "object" && p.counts && typeof p.counts === "object");
  }
  function provTotal(p) {
    return PROV_ORDER.reduce(function (s, k) { return s + (Number(p.counts[k]) || 0); }, 0);
  }

  // One sentence of counts, every status named even at zero: "0 fitted to
  // data" is the finding for a score, not an omission.
  function provenanceLine(p, subject, seeAlso, qualifier) {
    var line = el("p", "prov");
    var total = provTotal(p);
    line.appendChild(document.createTextNode("This " + (subject || "answer") + " reads "));
    line.appendChild(el("b", null, String(total)));
    line.appendChild(document.createTextNode(" registered constant" + (total === 1 ? "" : "s")
      + (qualifier ? " " + qualifier : "") + ": "));
    PROV_ORDER.forEach(function (k, i) {
      if (i) line.appendChild(document.createTextNode(i === PROV_ORDER.length - 1 ? ", and " : ", "));
      line.appendChild(el("b", null, String(Number(p.counts[k]) || 0)));
      line.appendChild(document.createTextNode(" " + PROV_PHRASE[k]));
    });
    line.appendChild(document.createTextNode("." + (seeAlso ? ' What each means is under "' + seeAlso + '".' : "")));
    return line;
  }

  function provenanceFull(p, b, data) {
    var wrap = el("div");
    // The interval comes first when the payload has one: it bounds the
    // number itself, where the counts below say what the number is made of.
    var iv = b.intervalField ? at(data, b.intervalField) : null;
    if (Array.isArray(iv) && iv.length === 2 && isFinite(iv[0]) && isFinite(iv[1])) {
      var pi = el("p", "pint");
      pi.appendChild(el("b", null, (b.intervalLabel || "95% interval") + ": "));
      pi.appendChild(document.createTextNode(num(Number(iv[0])) + " to " + num(Number(iv[1]))));
      wrap.appendChild(pi);
    }
    wrap.appendChild(provenanceLine(p, b.subject, null));
    var total = provTotal(p);
    if (total > 0) {
      // A picture of the shares. Hidden from assistive tech: the list under
      // it says the same thing in text.
      var stack = el("div", "pstack");
      stack.setAttribute("aria-hidden", "true");
      PROV_ORDER.forEach(function (k) {
        var n = Number(p.counts[k]) || 0;
        if (!n) return;
        var seg = el("i", "psw-" + k);
        seg.style.width = (n / total * 100) + "%";
        stack.appendChild(seg);
      });
      wrap.appendChild(stack);
    }
    var ul = el("ul", "pcounts");
    PROV_ORDER.forEach(function (k) {
      var li = el("li");
      var chip = el("span", "pchip " + k);
      chip.appendChild(el("span", "sw psw-" + k));
      chip.appendChild(document.createTextNode(k));
      li.appendChild(chip);
      li.appendChild(el("span", "pnum", String(Number(p.counts[k]) || 0)));
      li.appendChild(el("span", "pmean", PROV_MEANING[k]));
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
    if (p.scope) wrap.appendChild(el("p", "pscope", String(p.scope)));
    if (p.note) wrap.appendChild(el("p", "pscope", String(p.note)));
    var ids = Array.isArray(p.hypotheses) ? p.hypotheses : [];
    if (ids.length) {
      // Grouped by area (the id's first segment), behind a disclosure: a
      // hundred ids are the evidence, not the summary.
      var d = el("details", "pids");
      d.appendChild(el("summary", null, "The " + ids.length + " hand-set constant" + (ids.length === 1 ? "" : "s")
        + " it read, by area"));
      var groups = {}, order = [];
      ids.forEach(function (id) {
        var g = String(id).split(".")[0];
        if (!groups[g]) { groups[g] = []; order.push(g); }
        groups[g].push(String(id));
      });
      order.forEach(function (g) {
        d.appendChild(el("p", "pgrp", g + " (" + groups[g].length + ")"));
        var l = el("ul", "pidl");
        groups[g].forEach(function (id) { l.appendChild(el("li", null, id)); });
        d.appendChild(l);
      });
      wrap.appendChild(d);
    }
    return wrap;
  }

  // Where a group of trait values comes from (trait-provenance.ts): a status
  // line over the meters, and on a row, a tag where that value differs from
  // the line: the model's default, a citation, or another registry status.
  function traitProv(data, b) {
    if (!b.provenanceField) return null;
    used[b.provenanceField.split(".")[0]] = true;
    var p = at(data, b.provenanceField);
    return p && typeof p === "object" && p.status ? p : null;
  }
  function traitStatusLine(p) {
    var box = el("div", "pstatus");
    box.appendChild(el("span", "pchip " + String(p.status), String(p.label || p.status)));
    box.appendChild(el("span", "ptext", String(p.note || "")));
    var marks = [];
    if (p.anchored && Object.keys(p.anchored).length) marks.push("anchored: the value is the percentile a published population mean implies on a normed instrument, still a hypothesis (select the tag for the source)");
    if (p.cited && Object.keys(p.cited).length) marks.push("cited: a finding is cited for the direction of this value, not for its number (select the tag for the source)");
    if (Array.isArray(p.unset) && p.unset.length) marks.push("default: the persona does not set this trait, so the model's default is shown");
    if (p.statuses && Object.keys(p.statuses).length) marks.push("a status name: that value's registry status differs from the line above");
    if (marks.length) box.appendChild(el("span", "ptext", "Marked on a row: " + marks.join("; ") + "."));
    return box;
  }
  function traitTag(p, name) {
    var slot = el("span", "pslot");
    if (!p) return slot;
    var cited = p.cited && p.cited[name];
    var anch = p.anchored && p.anchored[name];
    var st = p.statuses && p.statuses[name];
    if (Array.isArray(p.unset) && p.unset.indexOf(name) >= 0) {
      slot.appendChild(el("span", "ptag", "default"));
    } else if (anch || cited) {
      var word = anch ? "anchored" : "cited";
      var btn = el("button", "ptag", word);
      btn.type = "button";
      btn.setAttribute("aria-describedby", "kit-tip");
      btn.setAttribute("aria-label", word + ": source for " + titleize(name));
      var iv = anch && Array.isArray(anch.interval) ? anch.interval : null;
      var info = anch
        ? { label: "Norm-anchored" + (st ? " (" + st + ")" : " (hypothesis)"),
            description: String(anch.cite) + ". " + String(anch.reported) + "."
              + (iv ? " Value interval " + iv[0] + " to " + iv[1] + "." : "")
              + " Mapping the instrument onto this trait is cbrowser's choice, so the value stays a hypothesis." }
        : { label: "Cited for direction" + (st ? " (" + st + ")" : ""),
            description: String(cited.cite) + ", for " + String(cited["for"]) + ". That supports the direction of this persona's difference from typical users, not the number." };
      btn.addEventListener("mouseenter", function () { showTip(btn, info); });
      btn.addEventListener("focus", function () { showTip(btn, info); });
      btn.addEventListener("mouseleave", hideTip);
      btn.addEventListener("blur", hideTip);
      slot.appendChild(btn);
    } else if (st) {
      slot.appendChild(el("span", "ptag", String(st)));
    }
    return slot;
  }

  async function chainBlock(data, b) {
    var layers = at(data, b.field);
    if (!isObjArray(layers) || !layers.length) return null;
    var nameKey = b.nameKey || "name";
    var costKey = b.costKey || "cost";
    var bottleneck = b.bottleneckField ? at(data, b.bottleneckField) : undefined;
    var additive = b.additiveField ? Number(at(data, b.additiveField)) : NaN;
    var total = b.totalField ? Number(at(data, b.totalField)) : NaN;

    // One scale across every bar, including the two summary bars, or the
    // comparison the block exists to make would be drawn to different rulers.
    var costs = layers.map(function (l) { return Number(l[costKey]) || 0; });
    var scaleMax = Math.max.apply(null, costs.concat(
      [isFinite(additive) ? additive : 0, isFinite(total) ? total : 0]));
    if (!(scaleMax > 0)) scaleMax = 1;

    var wrap = el("div", "chain");

    // Overlays keyed by layer name, so a bar can find its own evidence.
    var ovs = {};
    var ovList = b.overlaysField ? at(data, b.overlaysField) : null;
    if (isObjArray(ovList)) {
      ovList.forEach(function (o) { if (o && o.layer) ovs[String(o.layer)] = o; });
    }
    var pane = el("div");

    function bar(label, value, hue, isPeak, ov) {
      var interactive = !!(ov && ov.available && ov.file);
      // A real <button> when there is something behind it, so it is keyboard
      // operable and announced as a control. A plain div when there is not --
      // styling a dead row to look clickable is the lie this avoids.
      var seg = interactive
        ? document.createElement("button")
        : el("div");
      seg.className = "seg" + (isPeak ? " peak" : "");
      if (interactive) { seg.type = "button"; seg.setAttribute("aria-expanded", "false"); }
      var lbl = el("div", "lbl", label);
      if (isPeak) lbl.appendChild(el("span", "peaktag", "bottleneck"));
      var track = el("div", "track");
      var fill = el("div", "fill");
      fill.style.width = Math.max(1, (value / scaleMax) * 100) + "%";
      fill.style.backgroundColor = "hsl(" + hue + ", 62%, 48%)";
      track.appendChild(fill);
      var num = el("div", "num", value.toFixed(3));
      seg.appendChild(lbl); seg.appendChild(track); seg.appendChild(num);
      if (ov && !ov.available) {
        var why = el("span", "noov", "no overlay");
        why.title = String(ov.reason || "no overlay for this layer");
        seg.appendChild(why);
      }
      if (interactive) {
        seg.addEventListener("click", function () {
          var open = seg.getAttribute("aria-expanded") === "true";
          // One pane, so opening a layer replaces the last rather than stacking
          // six screenshots down the panel.
          wrap.querySelectorAll("button.seg").forEach(function (n) { n.setAttribute("aria-expanded", "false"); });
          pane.innerHTML = "";
          if (open) return;
          seg.setAttribute("aria-expanded", "true");
          showOverlay(ov, label);
        });
      }
      return seg;
    }

    async function showOverlay(ov, label) {
      pane.className = "ovpane";
      pane.appendChild(el("p", "cap", "Loading " + label + " overlay…"));
      try {
        var res = await app.callServerTool({
          name: b.fetchTool || "artifact_fetch",
          arguments: { file: ov.file },
        });
        var img = ((res && res.content) || []).filter(function (c) { return c.type === "image"; })[0];
        pane.innerHTML = "";
        if (!img) {
          pane.appendChild(el("p", "cap", "The " + label + " overlay could not be loaded."));
          return;
        }
        var node = document.createElement("img");
        node.src = "data:" + (img.mimeType || "image/png") + ";base64," + img.data;
        // Named for what it shows, not "overlay image" -- a screen reader user
        // gets the same sentence a sighted one reads under it.
        node.alt = label + " overlay for this page: " + (ov.legend || "");
        pane.appendChild(node);
        if (ov.legend) pane.appendChild(el("p", "cap", String(ov.legend)));
        // The map's own block: the attention model's constants, which the
        // score's block leaves out because the map is context, not input.
        if (isProvenance(ov.provenance)) {
          pane.appendChild(provenanceLine(ov.provenance, "map", null, "of the attention model, counted apart from the score"));
        }
      } catch (e) {
        pane.innerHTML = "";
        pane.appendChild(el("p", "cap", "Could not load the " + label + " overlay: " + (e && e.message ? e.message : e)));
      }
    }

    // Width and colour deliberately use DIFFERENT denominators.
    //
    // Width is on the shared scale, so a layer bar and the sequential-total bar
    // below it can be compared honestly. Colour is relative to the largest
    // LAYER, because the shared scale made every layer green: the biggest layer
    // was 0.171 against a 0.742 total, which is 23% of the ramp, so a page at
    // 63% abandonment risk rendered as six healthy green bars. Ramping colour
    // within the layers is what makes the bottleneck the hottest thing on
    // screen -- which is the one thing this block exists to show.
    var layerMax = Math.max.apply(null, costs);
    if (!(layerMax > 0)) layerMax = 1;
    layers.forEach(function (l) {
      var name = String(l[nameKey] == null ? "" : l[nameKey]);
      var cost = Number(l[costKey]) || 0;
      var isPeak = bottleneck != null && String(bottleneck) === name;
      // Cost, not capability: high is bad, so the ramp runs green to red.
      wrap.appendChild(bar(name, cost, 120 - Math.min(1, cost / layerMax) * 120, isPeak, ovs[name]));
    });
    wrap.appendChild(pane);

    if (isFinite(additive) && additive > 0) {
      var amp = el("div", "amp");
      // Computed BEFORE the bars that read it. var hoists, so declaring this
      // below its first use left the guard comparing undefined !== null, which
      // is true -- the guard passed and the bar was drawn with no value.
      //
      // The in-sequence total comes from totalField, which must be in
      // layer-cost units like additive: cognitive_effort points it at raw. Its
      // total was a logistic of raw and is now a percentile; plotting additive
      // against it drew a 1.034 bar beside a 0.410 bar and told the 60%-less
      // story in pixels while the caption underneath said +2%. Both bars are in
      // layer-cost units or the comparison is omitted.
      var rawTotal = isFinite(total) ? total : null;
      var ratio = rawTotal === null ? null : rawTotal / additive;
      var pct = ratio === null ? 0 : Math.round(Math.abs(1 - ratio) * 100);
      if (ratio !== null) {
        amp.appendChild(bar("sum of layers", additive, 205, false, null));
        amp.appendChild(bar("actual, in sequence", rawTotal, 205, false, null));
      }
      // Describes the coefficient it actually measured.
      //
      // The first version assumed the chain AMPLIFIES, matching the old
      // sequentialAmplification name, and fell back to "close to additive"
      // otherwise. NOTE: no backticks anywhere in this block -- it is inside a
      // template literal, so one silently ends the string and the whole widget
      // stops compiling. Against real data the coefficient is 0.30-0.39, so
      // the widget confidently called a 61-70% compression "close to additive".
      // The mock payload used to build it had additive < total, which is the
      // one shape the tool has never actually produced. (2026-08-02)
      amp.appendChild(el("p", "ampnote",
        // No raw total, no claim. Falling back to the 0-1 total here is what
        // produced "about 60% less" on a chain that actually adds ~1%: total
        // was then a logistic of raw (now a percentile) and additive is a sum,
        // so their ratio measures the mapping, not the chain. A payload from
        // before raw existed cannot answer this, and saying so beats answering
        // it wrongly.
        ratio === null
          ? "This result predates the raw cost being reported, so the chain's effect cannot be computed from it. The bars above are still exact; only the comparison below them is unavailable."
          : ratio > 1.0005
          ? "The layers run in sequence, so each one spends what the last left over. That adds "
            + pct + "% over their sum (" + ratio.toFixed(3) + "x)"
            + (bottleneck ? ", concentrated in " + bottleneck + "." : ".")
          : ratio < 0.995
          ? "Running the layers in sequence costs " + ratio.toFixed(3) + "x their sum, about "
            + pct + "% less"
            + (bottleneck ? ", and " + bottleneck + " is where the cost concentrates." : ".")
          : "Sequential and additive cost agree to within a rounding error: no layer is arriving on a materially depleted budget"
            + (bottleneck ? ", and " + bottleneck + " carries the chain on its own." : ".")));
      wrap.appendChild(amp);
    }
    return wrap;
  }

  function levelsBlock(data, b) {
    var levels = at(data, b.field);
    if (!isObjArray(levels)) return null;
    var value = b.valueField ? at(data, b.valueField) : undefined;
    var label = b.labelField ? at(data, b.labelField) : undefined;
    var behaviors = b.behaviorsField ? at(data, b.behaviorsField) : undefined;

    var wrap = el("div", "scale");
    var bands = el("div", "bands");
    levels.forEach(function (lv) {
      var band = el("div", "band", String(lv.label || ""));
      var v = Number(lv.value);
      // Active band chosen by nearest level, since the queried value rarely
      // lands exactly on a band's own value.
      var on = !!label && String(lv.label) === String(label);
      if (isFinite(v)) {
        var fill = hslHex(v * 120, 0.65, 0.5);
        if (on) { band.style.backgroundColor = fill; band.style.color = readableOn(fill); }
        else band.style.backgroundColor = "hsla(" + (v * 120) + ", 65%, 50%, .42)";
      }
      if (on) band.classList.add("on");
      band.title = String(lv.label || "");
      bands.appendChild(band);
    });
    if (typeof value === "number" && isFinite(value)) {
      var m = el("div", "marker", value.toFixed(2));
      m.style.left = Math.max(2, Math.min(98, value * 100)) + "%";
      bands.appendChild(m);
    }
    wrap.appendChild(bands);

    if (label) wrap.appendChild(el("p", "lvlname", String(label)));
    if (Array.isArray(behaviors) && behaviors.length) {
      var ul = el("ul", "behav");
      behaviors.forEach(function (x) { ul.appendChild(el("li", null, String(x))); });
      wrap.appendChild(ul);
    }
    return wrap;
  }

  function scoreBlock(data, b) {
    var wrap = el("div");
    var grade = at(data, b.gradeField);
    var score = at(data, b.scoreField);
    if (grade !== undefined || score !== undefined) {
      var row = el("div", "score");
      if (grade !== undefined) {
        row.appendChild(el("span", "grade " + String(grade).toLowerCase().charAt(0), String(grade)));
      }
      if (score !== undefined) row.appendChild(el("span", "scoresub", String(score)));
      wrap.appendChild(row);
    }
    var cats = at(data, b.categoriesField);
    if (isObjArray(cats)) {
      var ul = el("cats" === "" ? "ul" : "ul", "cats");
      // Normalised against the largest value present, so bars stay comparable
      // even when a source reports out of something other than 100.
      var max = Math.max.apply(null, cats.map(function (c) { return Number(c[b.valueKey]) || 0; }).concat([1]));
      cats.forEach(function (c) {
        var li = el("li");
        li.appendChild(el("span", "catname", fmt(c[b.labelKey])));
        var v = Number(c[b.valueKey]) || 0;
        var w = b.weightKey && c[b.weightKey] !== undefined ? " · weight " + c[b.weightKey] : "";
        li.appendChild(el("span", "catval", v + w));
        var bar = el("div", "bar"), fill = el("i");
        fill.style.width = Math.max(2, Math.round((v / max) * 100)) + "%";
        bar.appendChild(fill); li.appendChild(bar);
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
    }
    return wrap;
  }

  async function imageBlock(data, b) {
    var wrap = el("div");
    var img = document.createElement("img");
    img.className = "shot"; img.alt = "";
    var inline = b.dataField ? at(data, b.dataField) : undefined;
    if (inline) {
      img.src = String(inline).startsWith("data:") ? inline : "data:image/png;base64," + inline;
      wrap.appendChild(img);
    } else if (b.fetchTool) {
      // Fetched after mount rather than shipped in the result: hosts cap tool
      // results near 150k characters and swap in a file pointer, which reaches
      // the widget as unparseable text. Heavy assets have to come over this
      // channel instead.
      var args = b.fetchArgsField ? at(data, b.fetchArgsField) : {};
      if (b.fetchArgs) {
        args = {};
        Object.keys(b.fetchArgs).forEach(function (k) { args[k] = at(data, b.fetchArgs[k]); });
      }
      // A result that names no file has no image to fetch. attention_analysis
      // called with heatmap: false is one: the panel used to draw "Predicted
      // attention", ask artifact_fetch for file undefined, and show a broken
      // image -- which read as "the images don't load" when none was ever
      // made. (Alexa, 2026-10-10: 9 of her last 10 runs had heatmap: false.)
      var missing = b.fetchArgs
        ? Object.keys(b.fetchArgs).filter(function (k) { return args[k] === undefined || args[k] === null || args[k] === ""; })
        : (args ? [] : ["arguments"]);
      if (missing.length) {
        wrap.appendChild(el("p", "cap", b.emptyNote || "No image in this result."));
        return wrap;
      }
      var note = el("p", "cap", "Loading image…");
      wrap.appendChild(img); wrap.appendChild(note);
      try {
        var res = await app.callServerTool({ name: b.fetchTool, arguments: args || {} });
        var blk = (res && res.content || []).filter(function (c) { return c.type === "image"; })[0];
        if (blk && blk.data) { img.src = "data:" + (blk.mimeType || "image/png") + ";base64," + blk.data; note.remove(); }
        else {
          // Say what the server said. "No image was returned" hid a tier refusal
          // and a missing file behind the same sentence.
          var why = "";
          var txt = (res && res.content || []).filter(function (c) { return c.type === "text"; })[0];
          if (txt && txt.text) {
            try { var j = JSON.parse(txt.text); why = j.message || j.error || ""; } catch (_) { why = txt.text; }
          }
          img.remove();
          note.textContent = "The image could not be loaded" + (why ? ": " + String(why).slice(0, 200) : ".");
        }
      } catch (e) {
        img.remove();
        note.textContent = "Could not load image: " + (e && e.message ? e.message : e);
      }
    } else {
      var url = at(data, b.urlField);
      // A URL on a host outside the sandbox allowlist cannot load here, so it
      // is offered as a link rather than an <img> that would render broken.
      var a = document.createElement("a");
      a.textContent = url ? "Open image" : "No image available";
      if (url) { a.href = url; a.addEventListener("click", function (ev) { ev.preventDefault(); app.openLink({ url: url }); }); }
      wrap.appendChild(a);
      return wrap;
    }
    if (b.caption) { var c = at(data, b.caption); if (c) wrap.appendChild(el("p", "cap", fmt(c))); }
    return wrap;
  }

  var SEV_COLOR = {
    critical: "#dc2626", blocker: "#dc2626",
    major: "#ea580c", high: "#ea580c", serious: "#ea580c",
    medium: "#ca8a04", moderate: "#ca8a04",
    minor: "#2563eb", low: "#2563eb", info: "#64748b", notice: "#64748b",
  };

  // hsl (degrees, 0-1, 0-1) as #rrggbb, so a fill drawn as hsl can be given
  // a readable label by readableOn below.
  function hslHex(h, s, l) {
    var k = function (n) { return (n + h / 30) % 12; };
    var a = s * Math.min(l, 1 - l);
    var f = function (n) {
      var c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return ("0" + Math.round(c * 255).toString(16)).slice(-2);
    };
    return "#" + f(0) + f(8) + f(4);
  }

  // Whichever of near-white / near-black contrasts better with a fill, by WCAG
  // relative luminance rather than by eye.
  function readableOn(hex) {
    var c = String(hex).replace("#", "");
    if (c.length !== 6) return "#fff";
    var lin = function (v) {
      v = parseInt(v, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    var L = 0.2126 * lin(c.slice(0, 2)) + 0.7152 * lin(c.slice(2, 4)) + 0.0722 * lin(c.slice(4, 6));
    var onWhite = 1.05 / (L + 0.05);
    var onBlack = (L + 0.05) / 0.05;
    return onWhite >= onBlack ? "#ffffff" : "#111418";
  }

  async function overlayBlock(data, b) {
    var shots = at(data, b.field);
    var shot = Array.isArray(shots) ? shots[0] : shots;
    if (!shot) return null;
    var rects = shot[b.rectsKey || "barrierRects"] || [];
    // The region of the document the image actually covers. captureSize is
    // read from the PNG header server-side, so it cannot disagree with the
    // picture; viewportSize is the fallback for older payloads.
    var cs = shot.captureSize || {};
    var origin = shot.captureOrigin || { x: 0, y: 0 };
    var ox = origin.x || 0, oy = origin.y || 0;
    var w = cs.width || (shot[b.widthKey || "viewportSize"] || {}).width;
    var h = cs.height || shot.captureHeight ||
      (shot[b.widthKey || "viewportSize"] || {}).height;
    if (!w || !h) return null;

    var wrap = el("div");
    var frame = el("div", "ovwrap");
    var img = document.createElement("img");
    img.alt = "Page screenshot with accessibility barriers outlined";
    frame.appendChild(img);
    wrap.appendChild(frame);

    var drawn = [], off = [];
    rects.forEach(function (r) {
      var rc = r.rect || r;
      // Image space: document coordinate minus the capture origin.
      var ix = rc ? rc.x - ox : 0, iy = rc ? rc.y - oy : 0;
      var inBounds = rc && typeof rc.x === "number" &&
        ix + (rc.width || 0) > 0 && iy + (rc.height || 0) > 0 &&
        ix < w && iy < h && !r.outsideScreenshot;
      (inBounds ? drawn : off).push(r);
    });

    drawn.forEach(function (r) {
      var rc = r.rect || r;
      // The persona-weighted grade, which is what the findings list is ranked
      // and coloured by. Falling back to the raw grade keeps older payloads
      // rendering; using the raw grade FIRST is what made the map disagree
      // with the list directly beneath it.
      var sev = String(r.severityForPersona || r.severity || "").toLowerCase();
      var color = SEV_COLOR[sev] || "#64748b";
      var box = el("div", "bx");
      // Percentages, so the boxes track the image at whatever width the host
      // renders it -- pixel offsets would drift the moment the frame resized.
      box.style.left = (((rc.x - ox) / w) * 100).toFixed(3) + "%";
      box.style.top = (((rc.y - oy) / h) * 100).toFixed(3) + "%";
      box.style.width = (((rc.width || 0) / w) * 100).toFixed(3) + "%";
      box.style.height = (((rc.height || 0) / h) * 100).toFixed(3) + "%";
      box.style.borderColor = color;
      box.style.boxShadow = "0 0 0 1px " + color + "55";
      // The finding number, so a box on the map can be found in the list
      // below it. Ten boxes group into five findings, so the numbers repeat --
      // that repetition is the information: it says these four boxes are one
      // problem, not four.
      if (r.finding) {
        var tag = el("span", "bxn", String(r.finding));
        tag.style.background = color;
        // White was hardcoded, which fails on the lighter severity fills:
        // white on the amber #ca8a04 is 2.6:1 and on the orange #ea580c is
        // 3.4:1, both under the 4.5:1 an 11px bold label needs. Chosen by
        // measured luminance so a new severity colour cannot reintroduce it.
        tag.style.color = readableOn(color);
        box.appendChild(tag);
      }
      var label = (r.finding ? "Finding " + r.finding + " — " : "") +
        (r.severityForPersona || r.severity || "barrier") + ": " + (r.type || "issue") +
        ((r.wcag || r.wcagCriteria || []).length ? " (WCAG " + (r.wcag || r.wcagCriteria).join(", ") + ")" : "") +
        (r.element ? " — " + r.element : "");
      box.title = label;
      box.setAttribute("aria-label", label);
      box.setAttribute("role", "img");
      frame.appendChild(box);
    });

    var sevs = [];
    var anyWeighted = false;
    drawn.forEach(function (r) {
      if (r.severityForPersona) anyWeighted = true;
      var s2 = String(r.severityForPersona || r.severity || "").toLowerCase();
      if (s2 && sevs.indexOf(s2) < 0) sevs.push(s2);
    });
    sevs.sort(function (a, c) {
      return (SEV_ORDER[a] === undefined ? 9 : SEV_ORDER[a]) -
             (SEV_ORDER[c] === undefined ? 9 : SEV_ORDER[c]);
    });
    if (sevs.length) {
      var lg = el("ul", "lg");
      sevs.forEach(function (s2) {
        var li = el("li");
        var sw = el("span", "sw"); sw.style.background = SEV_COLOR[s2] || "#64748b";
        li.appendChild(sw);
        // Counted by the SAME grade the swatch is labelled with. Counting the
        // raw grade under a weighted label printed "critical (0)" next to ten
        // red boxes.
        li.appendChild(document.createTextNode(s2 + " (" + drawn.filter(function (r) {
          return String(r.severityForPersona || r.severity || "").toLowerCase() === s2;
        }).length + ")"));
        lg.appendChild(li);
      });
      wrap.appendChild(lg);
      // Name the scale. The same colours on an unweighted map would mean
      // something else, and a legend that does not say which is which is why
      // the colours looked like they aligned with nothing.
      var counted = drawn.filter(function (r) { return r.finding; }).length;
      wrap.appendChild(el("p", "lgnote",
        (anyWeighted
          ? "Coloured by severity for this persona — the same grade the findings below are ranked by."
          : "Coloured by WCAG severity.") +
        (counted ? " Numbers match the findings list; boxes sharing a number are one finding." : "")));
    }

    // Barriers that fall outside the capture are listed, not silently dropped.
    // They are real findings; the image just cannot show them.
    if (off.length) {
      var ol = el("ul", "offlist");
      ol.appendChild(el("li", null, off.length + " barrier" + (off.length === 1 ? "" : "s") +
        " outside the captured area, listed rather than drawn:"));
      off.slice(0, 8).forEach(function (r) {
        ol.appendChild(el("li", null, "• " + (r.severity || "barrier") + " " + (r.type || "") +
          (r.element ? " — " + r.element : "")));
      });
      wrap.appendChild(ol);
    }

    var file = shot[b.fileKey || "screenshotFile"];
    if (b.fetchTool && file) {
      try {
        var res = await app.callServerTool({ name: b.fetchTool, arguments: { file: file } });
        var blk = (res && res.content || []).filter(function (c) { return c.type === "image"; })[0];
        if (blk && blk.data) img.src = "data:" + (blk.mimeType || "image/png") + ";base64," + blk.data;
      } catch (e) { /* boxes still convey positions even without the picture */ }
    }
    if (!img.src && shot.screenshot) {
      img.src = String(shot.screenshot).startsWith("data:")
        ? shot.screenshot : "data:image/png;base64," + shot.screenshot;
    }
    if (!img.src) {
      // Never leave boxes floating over nothing: say the image is missing.
      img.remove();
      frame.appendChild(el("p", "cap", "Screenshot unavailable — barrier positions listed below rather than drawn."));
    }
    return wrap;
  }

  function section(title, count, node, open) {
    var d = el("details", "sec");
    if (open) d.open = true;
    var sm = el("summary");
    sm.appendChild(el("span", "chev"));
    sm.appendChild(el("span", "stitle", title));
    if (count !== null && count !== undefined) sm.appendChild(el("span", "scount", String(count)));
    d.appendChild(sm);
    var body = el("div", "sbody"); body.appendChild(node); d.appendChild(body);
    return d;
  }

  var tabSeq = 0;
  // Tabs, built to the WAI-ARIA tabs pattern rather than as styled buttons:
  // roles, aria-selected, aria-controls, a roving tabindex so Tab enters the
  // strip once, and Arrow/Home/End to move between tabs. This widget reports
  // accessibility barriers; it does not get to introduce one.
  async function tabsBlock(data, b) {
    var rows = at(data, b.field);
    if (!isObjArray(rows)) return null;
    var order = [], groups = {};
    rows.forEach(function (r) {
      var key = String(r[b.groupBy] === undefined ? "unknown" : r[b.groupBy]);
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(r);
    });
    if (order.length < 2) {
      // One group is not a tab strip; render the inner block on its own.
      var solo = await buildBlock(data, Object.assign({}, b.render, { field: b.field }));
      return solo ? solo.node : null;
    }

    var wrap = el("div");
    var strip = el("div", "tabs");
    strip.setAttribute("role", "tablist");
    var uid = "tb" + (++tabSeq);
    var panels = [];

    // A full URL is a poor tab label; the path is what distinguishes them.
    var shortLabel = function (v) {
      try {
        var u = new URL(v);
        return u.pathname === "/" ? u.hostname : u.pathname;
      } catch (_) { return titleize(v); }
    };

    for (var i = 0; i < order.length; i++) {
      var key = order[i];
      var btn = el("button", "tab");
      btn.type = "button";
      btn.id = uid + "-t" + i;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-controls", uid + "-p" + i);
      btn.setAttribute("aria-selected", i === 0 ? "true" : "false");
      btn.tabIndex = i === 0 ? 0 : -1;
      btn.appendChild(document.createTextNode(shortLabel(key)));
      btn.appendChild(el("span", "tabn", String(groups[key].length)));
      // The full value stays reachable for anything the label abbreviates.
      btn.title = key;
      strip.appendChild(btn);

      var panel = el("div");
      panel.id = uid + "-p" + i;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", btn.id);
      if (i !== 0) panel.hidden = true;
      // The inner block reads its rows from a scoped object, so any block type
      // works here without knowing it is inside a tab.
      var scoped = {};
      scoped[b.groupBy + "__rows"] = groups[key];
      var inner = await buildBlock(scoped, Object.assign({}, b.render, { field: b.groupBy + "__rows" }));
      if (inner) panel.appendChild(inner.node);
      panels.push(panel);
    }

    var tabEls = [].slice.call(strip.children);
    var select = function (idx) {
      tabEls.forEach(function (t, j) {
        var on = j === idx;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on;
      });
      tabEls[idx].focus();
    };
    tabEls.forEach(function (t, j) {
      t.addEventListener("click", function () { select(j); });
      t.addEventListener("keydown", function (e) {
        var k = e.key, next = null;
        if (k === "ArrowRight" || k === "ArrowDown") next = (j + 1) % tabEls.length;
        else if (k === "ArrowLeft" || k === "ArrowUp") next = (j - 1 + tabEls.length) % tabEls.length;
        else if (k === "Home") next = 0;
        else if (k === "End") next = tabEls.length - 1;
        if (next !== null) { e.preventDefault(); select(next); }
      });
    });

    wrap.appendChild(strip);
    panels.forEach(function (p) { wrap.appendChild(p); });
    return wrap;
  }

  async function buildBlock(data, b) {
    if (b.type === "kv") {
      var pairs = [];
      if (b.field) {
        used[b.field.split(".")[0]] = true;
        var o = at(data, b.field);
        if (o && typeof o === "object") flattenPairs(o, "", pairs);
      }
      (b.fields || []).forEach(function (f) {
        used[f.split(".")[0]] = true;
        var v = at(data, f);
        if (v !== undefined) pairs.push([titleize(f.split(".").pop()), v]);
      });
      return pairs.length ? { node: kvTable(pairs), count: pairs.length } : null;
    }
    if (b.type === "table") {
      used[b.field.split(".")[0]] = true;
      var rows = at(data, b.field);
      if (!isObjArray(rows)) return null;
      // One row is a record, not a table. Laying a single result out
      // horizontally gives every field a column, so sixteen fields became
      // sixteen columns of a one-row grid -- unreadable at any width, and the
      // nested ones printed JSON. Flattened into label/value pairs it reads
      // like the rest of the widget.
      if (rows.length === 1) {
        var recPairs = [];
        flattenPairs(rows[0], "", recPairs);
        return { node: kvTable(recPairs), count: 1 };
      }
      return { node: gridTable(rows, b.columns), count: rows.length };
    }
    if (b.type === "findings") {
      used[b.field.split(".")[0]] = true;
      var f = at(data, b.field);
      return isObjArray(f) ? { node: findingsList(f, b), count: f.length } : null;
    }
    if (b.type === "score") {
      [b.gradeField, b.scoreField, b.categoriesField].forEach(function (p) { if (p) used[p.split(".")[0]] = true; });
      var node = scoreBlock(data, b);
      return node.childNodes.length ? { node: node, count: null } : null;
    }
    if (b.type === "image") {
      [b.urlField, b.dataField, b.fetchArgsField, b.caption].forEach(function (p) { if (p) used[p.split(".")[0]] = true; });
      return { node: await imageBlock(data, b), count: null };
    }
    if (b.type === "traits") {
      used[b.field.split(".")[0]] = true;
      var rows = normaliseTraits(at(data, b.field), b);
      var tprov = traitProv(data, b);
      return rows.length ? { node: traitsBlock(rows, b, tprov), count: rows.length } : null;
    }
    if (b.type === "manager") {
      used[b.field.split(".")[0]] = true;
      var mnode = managerBlock(data, b);
      return mnode.childNodes.length ? { node: mnode, count: null } : null;
    }
    if (b.type === "editor") {
      used[b.field.split(".")[0]] = true;
      if (b.personaField) used[b.personaField.split(".")[0]] = true;
      var erows = normaliseTraits(at(data, b.field), b);
      var eprov = traitProv(data, b);
      return erows.length ? { node: editorBlock(erows, b, data, eprov), count: erows.length } : null;
    }
    if (b.type === "chain") {
      [b.field, b.bottleneckField, b.additiveField, b.totalField, b.overlaysField].forEach(function (f) {
        if (f) used[f.split(".")[0]] = true;
      });
      var node = await chainBlock(data, b);
      return node ? { node: node, count: null } : null;
    }
    if (b.type === "levels") {
      [b.field, b.valueField, b.labelField, b.behaviorsField].forEach(function (f) {
        if (f) used[f.split(".")[0]] = true;
      });
      var node = levelsBlock(data, b);
      return node ? { node: node, count: null } : null;
    }
    if (b.type === "tabs") {
      used[b.field.split(".")[0]] = true;
      var node = await tabsBlock(data, b);
      return node ? { node: node, count: null } : null;
    }
    if (b.type === "overlay") {
      used[b.field.split(".")[0]] = true;
      var node = await overlayBlock(data, b);
      return node ? { node: node, count: null } : null;
    }
    if (b.type === "note") {
      used[b.field.split(".")[0]] = true;
      var t = at(data, b.field);
      if (b.templates && t && typeof t === "object") {
        var said = fillTemplate(t, b.by, b.templates);
        return said ? { node: el("p", null, said), count: null } : null;
      }
      return t ? { node: el("p", null, fmt(t)), count: null } : null;
    }
    if (b.type === "provenance") {
      used[b.field.split(".")[0]] = true;
      var pv = at(data, b.field);
      if (!isProvenance(pv)) return null;
      return b.variant === "full"
        ? { node: provenanceFull(pv, b, data), count: provTotal(pv) }
        : { node: provenanceLine(pv, b.subject, b.seeAlso), count: null };
    }
    if (b.type === "rest") {
      var rest = [];
      Object.keys(data).forEach(function (k) {
        if (used[k]) return;
        var v = data[k];
        if (isObjArray(v)) return;
        if (v && typeof v === "object" && !Array.isArray(v)) {
          flattenPairs(v, titleize(k), rest);
        } else rest.push([titleize(k), v]);
      });
      return rest.length ? { node: kvTable(rest), count: rest.length } : null;
    }
    return null;
  }

  async function buildSections(data, blocks) {
    var out = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.type === "drawer") continue;
      var built = await buildBlock(data, b);
      if (built) out.push(section(b.title || titleize(b.type), built.count, built.node, !!b.open));
    }
    return out;
  }

  function healthOf(data, spec) {
    if (!spec || !spec.checks || !spec.checks.length) return null;
    var issues = [], measured = false;
    spec.checks.forEach(function (c) {
      var arr = at(data, c.field);
      if (!isObjArray(arr)) return;
      measured = true;
      arr.forEach(function (row) {
        if (!row[c.flag]) issues.push(c.failLabel + ": " + (row[c.nameKey || "name"] || "?"));
      });
    });
    // Three states: "measured nothing" is a different claim from "nothing is
    // wrong", and collapsing them reports healthy on no evidence.
    if (!measured) return { state: "unknown", label: "UNKNOWN", issues: [] };
    return issues.length ? { state: "bad", label: "DEGRADED", issues: issues }
                         : { state: "ok", label: "HEALTHY", issues: [] };
  }

  // Renders are generation-stamped because render() is async: image blocks
  // await callServerTool, so two overlapping renders interleave -- the second
  // clears the root, then the first resumes and appends its blocks into it,
  // and the panel shows everything twice. Any render whose generation is stale
  // stops appending.
  var renderGen = 0;

  async function render(data) {
    if (!data) return;
    var gen = ++renderGen;
    root.replaceChildren();
    used = {};

    var hero = SPEC.hero || {};
    var variant = hero.variant || "gradient";
    var band = el("div", "hero " + variant);
    var hrow = el("div", "hrow");
    if (LOGO) {
      var badge = el("span", "badge");
      var im = document.createElement("img"); im.src = LOGO; im.alt = "";
      badge.appendChild(im); hrow.appendChild(badge);
    }
    // Payload title when the view is about a named thing; the spec title is the
    // fallback and the label for views that are about the tool itself.
    var titleResolved = SPEC.titleField && at(data, SPEC.titleField);
    var titleText = titleResolved
      ? (SPEC.titlePrefix || "") + fmt(titleResolved)
      : SPEC.title;
    hrow.appendChild(el("span", "htitle", String(titleText)));

    var h = healthOf(data, hero.health);
    if (h) {
      var pill = el("span", "health " + h.state);
      pill.appendChild(el("i", "dot"));
      pill.appendChild(document.createTextNode(h.label));
      hrow.appendChild(pill);
    }
    band.appendChild(hrow);

    if (h && h.issues.length) {
      band.appendChild(el("p", "hnote", h.issues.length === 1 ? h.issues[0]
        : h.issues.length + " problems: " + h.issues.join("; ")));
    } else if (hero.subtitle) {
      var sub = typeof hero.subtitle === "string" ? hero.subtitle : at(data, hero.subtitle.field);
      if (sub) band.appendChild(el("p", "hnote", fmt(sub)));
    }

    var actionList = (hero.actions || []).slice();
    if (SPEC.toolPage) actionList.push({ label: "View tool docs", url: SPEC.toolPage });
    if (actionList.length) {
      var acts = el("div", "acts");
      actionList.forEach(function (a) {
        var url = a.urlField ? at(data, a.urlField) : a.url;
        if (!url) return;
        var btn = el("button", "act", a.label);
        btn.type = "button";
        btn.addEventListener("click", function () { app.openLink({ url: String(url) }); });
        acts.appendChild(btn);
      });
      if (acts.childNodes.length) band.appendChild(acts);
    }

    if (hero.facts && hero.facts.length) {
      var strip = el("div", "facts");
      hero.facts.forEach(function (f) {
        var v = at(data, f.field);
        var value = null, attn = false;
        if (f.countFlag && isObjArray(v)) {
          var ok = v.filter(function (x) { return x[f.countFlag]; }).length;
          value = ok + "/" + v.length;
          attn = !!f.attnWhenShort && ok < v.length;
        } else if (Array.isArray(v)) {
          value = String(v.length);
        } else if (f.templates && v && typeof v === "object") {
          value = fillTemplate(v, f.by, f.templates);
        } else if (v && typeof v === "object") {
          // A bag of named numbers is a countable collection too. Without this
          // a fact pointing at a traits object silently produced nothing, which
          // reads as a missing field rather than an unhandled shape.
          value = String(Object.keys(v).length);
        } else if (v !== undefined) {
          value = String(v);
        }
        if (value === null) return;
        used[f.field.split(".")[0]] = true;
        var chip = el("span", "fact" + (attn ? " attn" : ""));
        chip.appendChild(el("b", null, value));
        chip.appendChild(el("span", null, f.label));
        strip.appendChild(chip);
      });
      if (strip.childNodes.length) band.appendChild(strip);
    }
    root.appendChild(band);

    // Top-level blocks render inline; a drawer collects its children so the
    // default state stays a card rather than a page.
    for (var i = 0; i < SPEC.blocks.length; i++) {
      if (gen !== renderGen) return;
      var b = SPEC.blocks[i];
      if (b.type === "drawer") {
        var kids = await buildSections(data, b.blocks || []);
        if (gen !== renderGen) return;
        if (!kids.length) continue;
        var d = el("details", "drawer");
        if (b.open) d.open = true;
        var sm = el("summary");
        sm.appendChild(el("span", "chev"));
        sm.appendChild(el("span", null, b.title || "Details"));
        sm.appendChild(el("span", "dcount", kids.length + (kids.length === 1 ? " section" : " sections")));
        d.appendChild(sm);
        var inner = el("div", "inner");
        kids.forEach(function (k) { inner.appendChild(k); });
        d.appendChild(inner);
        root.appendChild(d);
      } else {
        var built = await buildBlock(data, b);
        if (gen !== renderGen) return;
        if (!built) continue;
        var wrap = el("div", "body");
        if (b.title) wrap.appendChild(el("h2", "btitle", b.title));
        wrap.appendChild(built.node);
        root.appendChild(wrap);
      }
    }

    if (SPEC.footer) {
      var fv = at(data, SPEC.footer.field);
      if (fv) {
        var p = el("p", "foot");
        p.appendChild(document.createTextNode(SPEC.footer.label + " "));
        p.appendChild(el("span", "path", fmt(fv)));
        root.appendChild(p);
      }
    }
  }

  function applyHostContext(ctx) {
    document.documentElement.classList.toggle("dark", ctx && ctx.theme === "dark");
    if (ctx && ctx.styles && ctx.styles.variables && applyHostStyleVariables) {
      applyHostStyleVariables(ctx.styles.variables);
    }
  }

  // Handlers before connect(), or the first result is delivered into nothing.
  var lastPayload = null;

  app.ontoolresult = function (res) {
    try {
      var data = res && res.structuredContent;
      if (!data && res && res.content && res.content[0] && res.content[0].text) {
        data = JSON.parse(res.content[0].text);
      }
      // Hosts may deliver the same result more than once (re-mount, replay,
      // reconnect). Re-rendering identical data is pure churn, and while the
      // generation guard keeps it correct, skipping it avoids refetching every
      // image over callServerTool for a panel that already shows them.
      var sig = null;
      try { sig = JSON.stringify(data); } catch (_) { sig = null; }
      if (sig !== null && sig === lastPayload) return;
      lastPayload = sig;
      render(data);
    } catch (e) {
      msg.textContent = "Could not read the payload: " + (e && e.message ? e.message : e);
    }
  };
  app.onhostcontextchanged = applyHostContext;

  try {
    await app.connect();
    applyHostContext(app.getHostContext());
  } catch (e) {
    msg.textContent = "Could not connect to the host: " + (e && e.message ? e.message : e);
  }
})();
`;

/**
 * Render a spec to a complete MCP Apps resource document.
 *
 * Top-level await is deliberately absent from the emitted script: older iframe
 * contexts throw on it, and the throw surfaces only as a blank widget.
 */
/**
 * Definitions baked into every widget, keyed by trait name.
 *
 * Sourced from TRAIT_DEFINITIONS, the authoritative reference matrix, rather
 * than written fresh -- a tooltip that disagrees with the docs is worse than
 * no tooltip. Keys are short because this ships inside every view; ~4KB for
 * all 26 traits, against a 300KB runtime bundle.
 *
 * Schwartz values have no runtime description map (they are interfaces with
 * JSDoc), so value meters currently render without tooltips rather than with
 * invented ones.
 */
function buildGlossary(): Record<string, { d: string; l?: string; h?: string }> {
  const out: Record<string, { d: string; l?: string; h?: string }> = {};
  for (const [key, def] of Object.entries(TRAIT_DEFINITIONS)) {
    out[key] = {
      d: def.description,
      ...(def.lowEnd ? { l: def.lowEnd } : {}),
      ...(def.highEnd ? { h: def.highEnd } : {}),
    };
  }
  return out;
}
let glossaryCache: string | undefined;

export function buildWidget(spec: WidgetSpec): string {
  if (glossaryCache === undefined) glossaryCache = JSON.stringify(buildGlossary());
  const script = RUNTIME
    .replace("__SPEC__", () => JSON.stringify(spec))
    .replace("__GLOSSARY__", () => glossaryCache as string)
    .replace("__LOGO__", () => getLogoDataUri());
  return `<!doctype html><meta charset="utf-8">
<meta name="color-scheme" content="light dark">
<style>${CSS}</style>
<div id="root"><p class="msg" id="msg">Waiting for the host&hellip;</p></div>
<script type="module">
${getExtAppsBundle()}
${script}
</script>`;
}
