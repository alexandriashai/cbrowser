/**
 * CBrowser MCP Tools - Cognitive Simulation Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import {
  getPersona,
  getAnyPersona,
  listPersonas,
  getCognitiveProfile,
  createCognitivePersona,
  isAgentPersonaObject,
} from "../../personas.js";
import { listAccessibilityPersonas, getAccessibilityPersona, describeAccessibilityPersona } from "../../personas.js";
import { getPersonaValues, rankInfluencePatternsForProfile, resolveValuesForPersona } from "../../values/index.js";
import { resolvePersonaValues } from "./values-tools.js";
import type {
  CognitiveState,
  AbandonmentThresholds,
  CognitiveTraits,
  Persona,
  AccessibilityPersona,
  PersonaLocation,
} from "../../types.js";

/**
 * Fetch custom personas from CMS for the current account.
 * Uses the API key from the session to authenticate.
 */
export async function fetchCustomPersonasFromCMS(apiKey?: string): Promise<Array<{
  name: string; slug: string; description: string; traits: Record<string, number>; values?: Record<string, number>; source: string;
}>> {
  if (!apiKey?.startsWith("cbk_")) return [];
  const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
  try {
    const res = await fetch(`${cmsUrl}/api/personas`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json() as { personas: Array<{
      name: string; slug: string; description: string; traits: string; schwartz_values?: string; source: string;
    }> };
    return data.personas.map(p => ({
      name: p.name,
      slug: p.slug,
      description: p.description,
      traits: typeof p.traits === "string" ? JSON.parse(p.traits) : p.traits,
      values: p.schwartz_values ? (typeof p.schwartz_values === "string" ? JSON.parse(p.schwartz_values) : p.schwartz_values) : undefined,
      source: p.source,
    }));
  } catch {
    return [];
  }
}

// Global API key for the current session (set by the remote server context)
let _sessionApiKey: string | undefined;
export function setSessionApiKey(key: string | undefined) { _sessionApiKey = key; }
export function getSessionApiKey(): string | undefined { return _sessionApiKey; }

/**
 * Register cognitive simulation tools (3 tools: cognitive_journey_init, cognitive_journey_update_state, list_cognitive_personas)
 */
export function registerCognitiveTools(
  server: McpServer,
  { getBrowser, getBrowserByToken }: ToolRegistrationContext
): void {
  server.registerTool("cognitive_journey_init", {
    title: "Initialize Cognitive Journey",
    description: "Initialize a cognitive user journey simulation. Returns the persona's cognitive profile, initial state, and abandonment thresholds. The actual simulation is driven by the LLM using browser tools (navigate, click, fill, screenshot) while tracking cognitive state.",
    inputSchema: {
      persona: z.string().describe("Persona name from list_cognitive_personas (e.g., 'first-timer', 'elderly-user', 'power-user'). An unknown name is refused unless customTraits defines an ad-hoc persona."),
      goal: z.string().describe("What the simulated user is trying to accomplish"),
      startUrl: z.string().url().describe("Starting URL for the journey"),
      customTraits: z.object({
        patience: z.number().min(0).max(1).optional(),
        riskTolerance: z.number().min(0).max(1).optional(),
        comprehension: z.number().min(0).max(1).optional(),
        persistence: z.number().min(0).max(1).optional(),
        curiosity: z.number().min(0).max(1).optional(),
        workingMemory: z.number().min(0).max(1).optional(),
        readingTendency: z.number().min(0).max(1).optional(),
        resilience: z.number().min(0).max(1).optional(),
        selfEfficacy: z.number().min(0).max(1).optional(),
        satisficing: z.number().min(0).max(1).optional(),
        trustCalibration: z.number().min(0).max(1).optional(),
        interruptRecovery: z.number().min(0).max(1).optional(),
        informationForaging: z.number().min(0).max(1).optional(),
        changeBlindness: z.number().min(0).max(1).optional(),
        anchoringBias: z.number().min(0).max(1).optional(),
        timeHorizon: z.number().min(0).max(1).optional(),
        attributionStyle: z.number().min(0).max(1).optional(),
        metacognitivePlanning: z.number().min(0).max(1).optional(),
        proceduralFluency: z.number().min(0).max(1).optional(),
        transferLearning: z.number().min(0).max(1).optional(),
        authoritySensitivity: z.number().min(0).max(1).optional(),
        emotionalContagion: z.number().min(0).max(1).optional(),
        fearOfMissingOut: z.number().min(0).max(1).optional(),
        socialProofSensitivity: z.number().min(0).max(1).optional(),
        mentalModelFlexibility: z.number().min(0).max(1).optional(),
        siteFamiliarity: z.number().min(0).max(1).optional(),
      }).optional().describe("Override specific cognitive traits (26 available, including siteFamiliarity: 0=brand new visitor, 1=daily user)"),
      location: z.object({
        timezone: z.string().optional().describe("IANA timezone (e.g., 'America/New_York', 'Europe/London')"),
        locale: z.string().optional().describe("BCP 47 locale (e.g., 'en-US', 'de-DE')"),
        geolocation: z.object({
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          accuracy: z.number().optional(),
        }).optional().describe("Geographic coordinates for geolocation-dependent features"),
      }).optional().describe("Override persona's location settings (timezone, locale, geolocation)"),
      waitAfterLoad: z.number().optional().describe("Extra ms to wait after page loads (e.g., 3000 for sites with client-side translation)"),
      waitForSelector: z.string().optional().describe("CSS selector to wait for after load (e.g., '[data-translated]')"),
    },
    annotations: {
      title: "Initialize Cognitive Journey",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ persona: personaName, goal, startUrl, customTraits, location, waitAfterLoad, waitForSelector }) => {
      const existingPersona = getAnyPersona(personaName);
      let personaObj: Persona | AccessibilityPersona;

      // v17.0.0: Check for agent personas - cognitive journeys don't support them yet
      if (existingPersona && isAgentPersonaObject(existingPersona)) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "Agent personas not supported for cognitive journeys",
              message: `"${personaName}" is an AI agent persona. Cognitive journeys simulate human behavior and require human personas.`,
              suggestedPersonas: ["first-timer", "power-user", "mobile-user"],
            }, null, 2),
          }],
        };
      }

      if (!existingPersona) {
        // v18.54.0: Check CMS for account-scoped custom personas before creating a generic one
        const cmsPersonas = await fetchCustomPersonasFromCMS(_sessionApiKey);
        const cmsMatch = cmsPersonas.find(p => p.slug === personaName || p.name.toLowerCase() === personaName.toLowerCase());
        if (cmsMatch) {
          // Build persona directly with ALL CMS traits — skip createCognitivePersona
          // which runs generatePersonaFromDescription and can normalize values
          const basePersona = createCognitivePersona(cmsMatch.name, cmsMatch.description, {});
          // Overwrite cognitiveTraits completely with CMS values (no defaults, no normalization)
          basePersona.cognitiveTraits = { ...basePersona.cognitiveTraits, ...cmsMatch.traits } as typeof basePersona.cognitiveTraits;

          // Register Schwartz values so saliency engine + journey engine can use them
          if (cmsMatch.values) {
            try {
              const { registerPersonaValues, createPersonaValues } = await import("../../values/index.js");
              const pv = createPersonaValues(
                {
                  selfDirection: cmsMatch.values.selfDirection ?? 0.5,
                  stimulation: cmsMatch.values.stimulation ?? 0.5,
                  hedonism: cmsMatch.values.hedonism ?? 0.5,
                  achievement: cmsMatch.values.achievement ?? 0.5,
                  power: cmsMatch.values.power ?? 0.5,
                  security: cmsMatch.values.security ?? 0.5,
                  conformity: cmsMatch.values.conformity ?? 0.5,
                  tradition: cmsMatch.values.tradition ?? 0.5,
                  benevolence: cmsMatch.values.benevolence ?? 0.5,
                  universalism: cmsMatch.values.universalism ?? 0.5,
                },
                {
                  autonomyNeed: cmsMatch.values.autonomyNeed ?? 0.5,
                  competenceNeed: cmsMatch.values.competenceNeed ?? 0.5,
                  relatednessNeed: cmsMatch.values.relatednessNeed ?? 0.5,
                },
                "esteem"
              );
              registerPersonaValues([{
                personaName: cmsMatch.slug || cmsMatch.name,
                values: pv,
                rationale: "Custom persona values from CMS",
              }]);
            } catch { /* values registration failed — proceed without */ }
          }

          personaObj = basePersona;
        } else if (customTraits && Object.keys(customTraits).length > 0) {
          // Caller-defined ad-hoc persona: the one legitimate synthesis.
          personaObj = createCognitivePersona(personaName, personaName, customTraits);
        } else {
          // A name nothing knows, with no traits, used to become a persona with
          // every trait at 0.5 named after the string -- a typo simulated as if
          // it were someone. (2026-10-09)
          const { suggestPersonaNames } = await import("../../personas.js");
          const suggestions = suggestPersonaNames(personaName);
          return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({
            error: `Unknown persona "${personaName}".${suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""} Run list_cognitive_personas for the roster, create one with persona_create_from_description, or pass customTraits to define an ad-hoc persona. Nothing was simulated.`,
            code: "unknown_persona", persona: personaName, suggestions,
          }, null, 2) }] };
        }
      } else if (customTraits) {
        const defaultTraits: CognitiveTraits = {
          patience: 0.5,
          riskTolerance: 0.5,
          comprehension: 0.5,
          persistence: 0.5,
          curiosity: 0.5,
          workingMemory: 0.5,
          readingTendency: 0.5,
          resilience: 0.5,
          selfEfficacy: 0.5,
          satisficing: 0.5,
          trustCalibration: 0.5,
          interruptRecovery: 0.5,
          informationForaging: 0.5,
          changeBlindness: 0.3,
          anchoringBias: 0.5,
          timeHorizon: 0.5,
          attributionStyle: 0.5,
          metacognitivePlanning: 0.5,
          proceduralFluency: 0.5,
          transferLearning: 0.5,
          authoritySensitivity: 0.5,
          emotionalContagion: 0.5,
          fearOfMissingOut: 0.5,
          socialProofSensitivity: 0.5,
          mentalModelFlexibility: 0.5,
          siteFamiliarity: 0.5,
        };
        personaObj = {
          ...existingPersona,
          cognitiveTraits: {
            ...defaultTraits,
            ...(existingPersona.cognitiveTraits || {}),
            ...customTraits,
          },
        };
      } else {
        personaObj = existingPersona;
      }

      const profile = getCognitiveProfile(personaObj);

      const initialState: CognitiveState = {
        patienceRemaining: 1.0,
        confusionLevel: 0.0,
        frustrationLevel: 0.0,
        goalProgress: 0.0,
        confidenceLevel: 0.5,
        currentMood: "neutral",
        memory: {
          pagesVisited: [startUrl],
          actionsAttempted: [],
          errorsEncountered: [],
          backtrackCount: 0,
        },
        timeElapsed: 0,
        stepCount: 0,
      };

      const traits = profile.traits;
      const thresholds: AbandonmentThresholds = {
        patienceMin: 0.1,
        confusionMax: traits.comprehension < 0.4 ? 0.6 : 0.8,
        frustrationMax: traits.patience < 0.3 ? 0.7 : 0.85,
        maxStepsWithoutProgress: traits.persistence > 0.7 ? 15 : 10,
        loopDetectionThreshold: 3,
        timeLimit: traits.patience > 0.7 ? 180 : (traits.patience < 0.3 ? 60 : 120),
      };

      // v18.33.0: Use token-based browser for session continuity
      let b: Awaited<ReturnType<typeof getBrowser>>;
      let browserToken: string | undefined;
      if (getBrowserByToken) {
        const result = await getBrowserByToken(undefined); // New session for init
        b = result.browser;
        browserToken = result.token;
      } else {
        b = await getBrowser();
      }

      // Apply location settings: explicit override > persona default
      const effectiveLocation: PersonaLocation = {
        ...((personaObj as Persona).location || {}),
        ...(location || {}),
      };
      let locationResult: {
        geolocationApplied?: boolean;
        timezoneStored?: boolean;
        localeStored?: boolean;
        effectiveTimezone?: string;
        effectiveLocale?: string;
        note?: string;
      } = {};
      if (effectiveLocation.timezone || effectiveLocation.locale || effectiveLocation.geolocation) {
        locationResult = await b.applyPersonaLocation(effectiveLocation);
      }

      const navOpts = {
        ...(waitAfterLoad ? { waitAfterLoad } : {}),
        ...(waitForSelector ? { waitForSelector } : {}),
      };
      await b.navigate(startUrl, navOpts);

      // v18.30.0: Verify browser is healthy after navigation
      // JS-heavy sites can crash the persistent browser context
      const MAX_RETRIES = 2;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const page = await b.getPage();
          const title = await page.title().catch(() => '');
          const bodyLen = await page.evaluate(() => document.body?.innerText?.length || 0).catch(() => 0);
          if (bodyLen > 0 || title) break; // Page is healthy

          // Page is blank — persistent context is corrupted
          console.warn(`[cognitive_journey_init] Blank page on attempt ${attempt + 1}. Resetting browser (persistent state preserved).`);
          await b.close();
          await b.launch();
          await b.navigate(startUrl, navOpts);
        } catch (e) {
          console.warn(`[cognitive_journey_init] Recovery attempt ${attempt + 1} failed: ${(e as Error).message}`);
          try { await b.close(); await b.launch(); await b.navigate(startUrl, navOpts); } catch {}
        }
      }

      // v18.35.0: Gate site model data by persona's siteFamiliarity trait
      // If persona claims high familiarity but no site model data exists,
      // downgrade to 0.0 and warn — can't simulate "knowing" a site we've never seen
      const requestedFamiliarity = profile.traits.siteFamiliarity ?? 0.5;
      let effectiveFamiliarity = requestedFamiliarity;
      let familiarityWarning: string | undefined;
      let siteModelContext: {
        hasModel: boolean;
        knownPaths?: number;
        suggestion?: string;
        familiarityLevel?: string;
        familiarityDowngraded?: boolean;
        originalFamiliarity?: number;
        /** Pages this install has crawled for the domain. Drives the ceiling. */
        pagesCrawled?: number;
        /** The constant the coverage ratio divides by. Chosen, not measured. */
        fullCoverageAt?: number;
        provenance?: string;
      } = { hasModel: false };

      try {
        const { SiteModelManager } = await import("../../site-model/manager.js");
        const siteModel = SiteModelManager.getInstance();
        const domain = new URL(startUrl).hostname;
        const stats = await siteModel.getModelStats(domain);
        const hasData = stats.navigationNodes > 0;

        // Downgrade familiarity if persona claims knowledge we don't have
        if (!hasData && requestedFamiliarity > 0.1) {
          effectiveFamiliarity = 0.0;
          familiarityWarning = `"${personaObj.name}" has siteFamiliarity=${requestedFamiliarity.toFixed(1)} but CBrowser has NO prior knowledge of ${domain}. Downgraded to 0.0 (first visit). To build site knowledge, navigate the site first — data accumulates automatically on every navigate/click/fill.`;
          siteModelContext = {
            hasModel: false,
            familiarityLevel: "none",
            familiarityDowngraded: true,
            originalFamiliarity: requestedFamiliarity,
            pagesCrawled: 0,
            fullCoverageAt: 20,
            provenance: "siteFamiliarity is a persona-site variable, not a disposition like the other 25 traits: the same persona is familiar with one site and not another. The effective value is capped by how many pages this install has crawled, which grows as you use the tool — so it is not reproducible across runs and should be read as a ceiling on what may be simulated, not as a measurement of the persona.",
            suggestion: familiarityWarning,
          };
        } else if (hasData && requestedFamiliarity > 0.05) {
          // Scale familiarity by data coverage — partial knowledge = partial familiarity
          // A site with 3 pages mapped shouldn't give "expert" level access
          // Coverage, not familiarity.
          //
          // navigationNodes counts pages THIS INSTALL has crawled, and it grows
          // on every navigate and click. So the same persona on the same site
          // yields a different number depending on how much crawling happened
          // first — the value is not a property of the persona or the site, and
          // it is not reproducible across runs. It is a ceiling on what we are
          // entitled to simulate, which is a useful guard and a bad measurement.
          // The 20-page threshold is a chosen constant, not a finding.
          // Reported alongside so the number explains itself. (2026-08-01)
          const coverageScore = Math.min(1.0, stats.navigationNodes / 20);
          effectiveFamiliarity = Math.min(requestedFamiliarity, coverageScore);

          if (effectiveFamiliarity < requestedFamiliarity - 0.1) {
            familiarityWarning = `"${personaObj.name}" has siteFamiliarity=${requestedFamiliarity.toFixed(1)} but site model only has ${stats.navigationNodes} pages mapped. Adjusted to ${effectiveFamiliarity.toFixed(1)}. More navigation will build fuller site knowledge.`;
          }

          const familiarityLevel =
            effectiveFamiliarity >= 0.8 ? "expert" :
            effectiveFamiliarity >= 0.5 ? "familiar" :
            effectiveFamiliarity >= 0.1 ? "vague" : "none";

          if (effectiveFamiliarity >= 0.8) {
            siteModelContext = {
              hasModel: true,
              pagesCrawled: stats.navigationNodes,
              fullCoverageAt: 20,
              provenance: "Capped by crawl coverage (pagesCrawled/fullCoverageAt), which grows as this install uses the tool — a ceiling on what may be simulated, not a reproducible measurement of the persona. siteFamiliarity is a persona-site variable, not a disposition like the other 25 traits.",
              knownPaths: stats.goalPaths,
              familiarityLevel,
              familiarityDowngraded: effectiveFamiliarity < requestedFamiliarity,
              originalFamiliarity: effectiveFamiliarity < requestedFamiliarity ? requestedFamiliarity : undefined,
              suggestion: stats.goalPaths > 0
                ? `This persona knows this site well. ${stats.goalPaths} known goal paths, ${stats.navigationNodes} mapped pages. Use site_model_query for best path.`
                : `This persona knows the site layout (${stats.navigationNodes} pages) but hasn't completed goals here.`,
            };
          } else if (effectiveFamiliarity >= 0.5) {
            siteModelContext = {
              hasModel: true,
              pagesCrawled: stats.navigationNodes,
              fullCoverageAt: 20,
              provenance: "Capped by crawl coverage (pagesCrawled/fullCoverageAt), which grows as this install uses the tool — a ceiling on what may be simulated, not a reproducible measurement of the persona. siteFamiliarity is a persona-site variable, not a disposition like the other 25 traits.",
              familiarityLevel,
              familiarityDowngraded: effectiveFamiliarity < requestedFamiliarity,
              originalFamiliarity: effectiveFamiliarity < requestedFamiliarity ? requestedFamiliarity : undefined,
              suggestion: familiarityWarning || `This persona has some familiarity with this site (${stats.navigationNodes} pages known).`,
            };
          } else {
            siteModelContext = {
              hasModel: stats.failurePatterns > 0,
              familiarityLevel,
              familiarityDowngraded: effectiveFamiliarity < requestedFamiliarity,
              originalFamiliarity: effectiveFamiliarity < requestedFamiliarity ? requestedFamiliarity : undefined,
              suggestion: stats.failurePatterns > 0
                ? `This persona vaguely recalls issues on this site (${stats.failurePatterns} known problems).`
                : familiarityWarning,
            };
          }
        } else {
          siteModelContext.familiarityLevel = "none";
        }
      } catch {
        // If site model fails, treat as no data — downgrade high familiarity
        if (requestedFamiliarity > 0.1) {
          effectiveFamiliarity = 0.0;
          siteModelContext = {
            hasModel: false,
            familiarityLevel: "none",
            familiarityDowngraded: true,
            originalFamiliarity: requestedFamiliarity,
            suggestion: `Site model unavailable. "${personaObj.name}" siteFamiliarity downgraded from ${requestedFamiliarity.toFixed(1)} to 0.0.`,
          };
        }
      }

      const personaValues = resolveValuesForPersona(personaObj.name);
      const influencePatterns = personaValues
        ? rankInfluencePatternsForProfile(personaValues).slice(0, 5)
        : undefined;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              persona: {
                name: personaObj.name,
                description: personaObj.description,
                demographics: personaObj.demographics,
                location: effectiveLocation.timezone || effectiveLocation.locale || effectiveLocation.geolocation ? {
                  timezone: effectiveLocation.timezone,
                  locale: effectiveLocation.locale,
                  geolocation: effectiveLocation.geolocation,
                  applied: locationResult,
                } : undefined,
                values: personaValues ? {
                  schwartz: {
                    selfDirection: personaValues.selfDirection,
                    stimulation: personaValues.stimulation,
                    hedonism: personaValues.hedonism,
                    achievement: personaValues.achievement,
                    power: personaValues.power,
                    security: personaValues.security,
                    conformity: personaValues.conformity,
                    tradition: personaValues.tradition,
                    benevolence: personaValues.benevolence,
                    universalism: personaValues.universalism,
                  },
                  higherOrder: {
                    openness: personaValues.openness,
                    selfEnhancement: personaValues.selfEnhancement,
                    conservation: personaValues.conservation,
                    selfTranscendence: personaValues.selfTranscendence,
                  },
                  sdt: {
                    autonomyNeed: personaValues.autonomyNeed,
                    competenceNeed: personaValues.competenceNeed,
                    relatednessNeed: personaValues.relatednessNeed,
                  },
                  maslowLevel: personaValues.maslowLevel,
                } : undefined,
                influenceSusceptibility: influencePatterns?.map(ip => ({
                  pattern: ip.pattern.name,
                  susceptibility: ip.susceptibility,
                })),
              },
              motivationalValues: personaValues ? {
                security: personaValues.security,
                stimulation: personaValues.stimulation,
                achievement: personaValues.achievement,
                conformity: personaValues.conformity,
                selfDirection: personaValues.selfDirection,
                tradition: personaValues.tradition,
                power: personaValues.power,
                maslowLevel: personaValues.maslowLevel,
              } : undefined,
              cognitiveProfile: profile,
              initialState,
              abandonmentThresholds: thresholds,
              goal,
              startUrl,
              // v18.35.0: Site model context for informed exploration
              siteModel: siteModelContext,
              // v18.33.0: Browser session token for continuity across tool calls
              _browserToken: browserToken || null,
              instructions: `
COGNITIVE JOURNEY SIMULATION INSTRUCTIONS:

You are now simulating a "${personaObj.name}" user with these cognitive traits:
- Patience: ${profile.traits.patience.toFixed(2)} ${profile.traits.patience < 0.3 ? "(impatient - will give up quickly)" : profile.traits.patience > 0.7 ? "(patient - will persist)" : "(moderate)"}
- Risk Tolerance: ${profile.traits.riskTolerance.toFixed(2)} ${profile.traits.riskTolerance < 0.3 ? "(cautious - hesitates)" : profile.traits.riskTolerance > 0.7 ? "(bold - clicks freely)" : "(moderate)"}
- Comprehension: ${profile.traits.comprehension.toFixed(2)} ${profile.traits.comprehension < 0.3 ? "(struggles with UI)" : profile.traits.comprehension > 0.7 ? "(expert at UI patterns)" : "(moderate)"}
- Reading Tendency: ${profile.traits.readingTendency.toFixed(2)} ${profile.traits.readingTendency < 0.3 ? "(scans only)" : profile.traits.readingTendency > 0.7 ? "(reads everything)" : "(selective reader)"}

Attention Pattern: ${profile.attentionPattern}
Decision Style: ${profile.decisionStyle}
${personaValues ? `
MOTIVATIONAL VALUES (Schwartz — influence what this persona notices and clicks):
- Security: ${personaValues.security.toFixed(2)} ${personaValues.security > 0.7 ? "(seeks trust signals, guarantees, reads policies)" : personaValues.security < 0.3 ? "(skips fine print, comfortable with risk)" : ""}
- Stimulation: ${personaValues.stimulation.toFixed(2)} ${personaValues.stimulation > 0.7 ? "(drawn to 'New', beta features, novelty)" : personaValues.stimulation < 0.3 ? "(ignores new features, prefers familiar)" : ""}
- Achievement: ${personaValues.achievement.toFixed(2)} ${personaValues.achievement > 0.7 ? "(seeks ROI, metrics, efficiency)" : ""}
- Conformity: ${personaValues.conformity.toFixed(2)} ${personaValues.conformity > 0.7 ? "(influenced by reviews, 'Most popular', social proof)" : personaValues.conformity < 0.3 ? "(ignores social proof, independent)" : ""}
- Self-Direction: ${personaValues.selfDirection.toFixed(2)} ${personaValues.selfDirection > 0.7 ? "(resists defaults, customizes, explores options)" : ""}
` : ""}
GOAL: "${goal}"

IMPORTANT: Pass _browserToken="${browserToken || ''}" to ALL subsequent tool calls (navigate, screenshot, click, fill, scroll, extract) to maintain browser state across calls.

SIMULATION LOOP:
1. PERCEIVE - Use screenshot (with _browserToken) to see the page. Filter by attention pattern.
2. COMPREHEND - Interpret elements as this persona would (lower comprehension = more confusion)
3. DECIDE - Choose action based on traits. Generate inner monologue.
4. EXECUTE - Use click/fill/navigate tools (always pass _browserToken).
5. EVALUATE - Update cognitive state after each action:
   - patienceRemaining -= 0.02 + (frustrationLevel × 0.05)
   - confusionLevel changes based on UI clarity
   - frustrationLevel increases on failures
6. CHECK ABANDONMENT - If thresholds exceeded, end journey with appropriate message.
7. LOOP - Return to PERCEIVE until goal achieved or abandoned.

ABANDONMENT TRIGGERS:
- Patience < ${thresholds.patienceMin}: "This is taking too long. I give up."
- Confusion > ${thresholds.confusionMax} for 30s: "I have no idea what to do."
- Frustration > ${thresholds.frustrationMax}: "This is so frustrating!"
- No progress after ${thresholds.maxStepsWithoutProgress} steps: "I'm not getting anywhere."
- Same page ${thresholds.loopDetectionThreshold}x: "I keep ending up here."
- Time > ${thresholds.timeLimit}s: "I've spent too long on this."

Begin the simulation now. Narrate your thoughts as this persona.
`,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("cognitive_journey_update_state", {
    title: "Update Cognitive State",
    description: "Update the cognitive state during a journey simulation. Call this after each action to track mental state.",
    inputSchema: {
      currentState: z.object({
        patienceRemaining: z.number(),
        confusionLevel: z.number(),
        frustrationLevel: z.number(),
        goalProgress: z.number(),
        confidenceLevel: z.number(),
        currentMood: z.enum(["neutral", "hopeful", "confused", "frustrated", "defeated", "relieved"]),
        stepCount: z.number(),
        timeElapsed: z.number(),
      }).describe("Current cognitive state"),
      actionResult: z.object({
        success: z.boolean(),
        wasConfusing: z.boolean().optional(),
        progressMade: z.boolean().optional(),
        wentBack: z.boolean().optional(),
      }).describe("Result of the last action"),
      personaTraits: z.object({
        patience: z.number(),
        riskTolerance: z.number(),
        comprehension: z.number(),
        persistence: z.number(),
      }).describe("Persona traits affecting state changes"),
      personaValues: z.object({
        security: z.number().optional(),
        stimulation: z.number().optional(),
        achievement: z.number().optional(),
        conformity: z.number().optional(),
        selfDirection: z.number().optional(),
        tradition: z.number().optional(),
        power: z.number().optional(),
      }).optional().describe("Schwartz motivational values (0-1). Modulate cognitive state changes: security increases risk aversion, stimulation rewards novelty, achievement increases impatience with inefficiency."),
    },
    annotations: {
      title: "Update Cognitive State",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async ({ currentState, actionResult, personaTraits, personaValues }) => {
      // Value modulation factors (0.8-1.2 range, default 1.0 when no values)
      const v = personaValues || {};
      const securityMod = 1 + ((v.security ?? 0.5) - 0.5) * 0.4;       // 0.8-1.2: high security = more reactive to failure
      const stimulationMod = 1 + ((v.stimulation ?? 0.5) - 0.5) * 0.4;  // 0.8-1.2: high stimulation = more patience for novelty
      const achievementMod = 1 + ((v.achievement ?? 0.5) - 0.5) * 0.4;  // 0.8-1.2: high achievement = more impatient with inefficiency
      const conformityMod = 1 + ((v.conformity ?? 0.5) - 0.5) * 0.4;    // 0.8-1.2: high conformity = more frustrated without social proof

      let newPatienceRemaining = currentState.patienceRemaining - 0.02;
      let newConfusionLevel = currentState.confusionLevel;
      let newFrustrationLevel = currentState.frustrationLevel;
      let newConfidenceLevel = currentState.confidenceLevel;
      let newMood = currentState.currentMood;

      // Patience drain from frustration — achievement-driven personas drain faster
      newPatienceRemaining -= currentState.frustrationLevel * 0.05 * achievementMod;

      if (actionResult.success) {
        // Success recovery — stimulation-seeking personas recover faster from novelty
        newConfusionLevel = Math.max(0, newConfusionLevel - 0.1 * stimulationMod);
        newFrustrationLevel = Math.max(0, newFrustrationLevel - 0.05);

        if (actionResult.progressMade) {
          // Achievement-driven personas get bigger confidence boost from progress
          newConfidenceLevel = Math.min(1, newConfidenceLevel + 0.1 * achievementMod);
        }
      } else {
        // Failure — security-focused personas accumulate MORE frustration on failure
        newFrustrationLevel = Math.min(1, newFrustrationLevel + 0.2 * securityMod);

      }

      if (actionResult.wasConfusing) {
        // Confusion — conformity-seeking personas get more confused without clear guidance
        newConfusionLevel = Math.min(1, newConfusionLevel + (1 - personaTraits.comprehension) * 0.15 * conformityMod);
      }

      if (actionResult.wentBack) {
        // Going back — security-focused personas lose more confidence (risk aversion)
        newConfidenceLevel = Math.max(0, newConfidenceLevel - 0.15 * securityMod);
      }

      // Mood resolved from the FINAL levels, by whichever dimension actually
      // dominates. It used to be assigned inside whichever branch happened to
      // run: frustration only set the mood on a FAILED action, while confusion
      // set it on any action guarded only by `newMood !== "frustrated"`. So a
      // persona carrying frustration 0.85 into a successful-but-confusing step
      // came out "confused" while frustration outranked confusion 0.85 to 0.65.
      // (2026-07-29)
      if (newFrustrationLevel > 0.8 && personaTraits.persistence < 0.5) {
        newMood = "defeated";
      } else if (newFrustrationLevel > 0.7 || newConfusionLevel > 0.5) {
        newMood = newFrustrationLevel >= newConfusionLevel ? "frustrated" : "confused";
      } else if (actionResult.success && actionResult.progressMade) {
        newMood = "hopeful";
      }

      // 6.18: goalProgress is a REQUIRED input that nothing read and nothing
      // returned, so every loop the caller supplied it and got nothing back —
      // state threading dropped it. progressMade already means "the goal moved",
      // so advance it there and echo it otherwise.
      const newGoalProgress = actionResult.progressMade
        ? Math.min(1, currentState.goalProgress + 0.1)
        : currentState.goalProgress;

      const newState: Partial<CognitiveState> = {
        goalProgress: newGoalProgress,
        patienceRemaining: Math.max(0, newPatienceRemaining),
        confusionLevel: newConfusionLevel,
        frustrationLevel: newFrustrationLevel,
        confidenceLevel: newConfidenceLevel,
        currentMood: newMood as CognitiveState["currentMood"],
        stepCount: currentState.stepCount + 1,
        timeElapsed: currentState.timeElapsed + 2,
      };

      let shouldAbandon = false;
      let abandonmentReason: string | undefined;
      let abandonmentMessage: string | undefined;

      // Abandonment thresholds — values shift sensitivity
      // Security-focused personas abandon earlier on risk/uncertainty
      // Achievement-focused personas abandon earlier on inefficiency
      const patienceThreshold = 0.1;
      const frustrationThreshold = 0.85 / securityMod;  // Lower threshold for high-security personas
      const confusionThreshold = 0.8 / conformityMod;   // Lower threshold for high-conformity personas

      // Precedence used to be an implicit if/else chain — patience, then
      // frustration, then confusion — so when two dimensions breached at once
      // the reported reason depended on source order and nothing said which had
      // actually driven the abandonment. Score each breach by how far PAST its
      // own threshold it went, report the worst, and name the others. Margins
      // are relative so thresholds of different scales stay comparable.
      // (2026-07-29)
      const breaches: Array<{ reason: string; margin: number; message: string }> = [];

      if (newState.patienceRemaining! < patienceThreshold) {
        breaches.push({
          reason: "patience",
          margin: (patienceThreshold - newState.patienceRemaining!) / Math.max(patienceThreshold, 1e-6),
          message: "This is taking too long. I give up.",
        });
      }
      if (newState.frustrationLevel! > frustrationThreshold) {
        breaches.push({
          reason: "frustration",
          margin: (newState.frustrationLevel! - frustrationThreshold) / Math.max(frustrationThreshold, 1e-6),
          message: (v.security ?? 0.5) > 0.7
            ? "This doesn't feel safe or reliable. I'm leaving."
            : "This is so frustrating! I'm done.",
        });
      }
      // Confusion still requires two consecutive breaching steps: a single
      // confusing moment is not grounds to give up.
      if (newState.confusionLevel! > confusionThreshold && currentState.confusionLevel > confusionThreshold) {
        breaches.push({
          reason: "confusion",
          margin: (newState.confusionLevel! - confusionThreshold) / Math.max(confusionThreshold, 1e-6),
          message: (v.conformity ?? 0.5) > 0.7
            ? "I can't tell what most people would do here. I'll try something else."
            : "I have no idea what I'm supposed to do here.",
        });
      }

      let alsoBreached: string[] | undefined;
      if (breaches.length > 0) {
        breaches.sort((a, b) => b.margin - a.margin);
        shouldAbandon = true;
        abandonmentReason = breaches[0].reason;
        abandonmentMessage = breaches[0].message;
        if (breaches.length > 1) alsoBreached = breaches.slice(1).map((b) => b.reason);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              newState,
              shouldAbandon,
              abandonmentReason,
              abandonmentMessage,
              // Named so a caller can see the reason was a choice between
              // simultaneous breaches, not the only one that fired.
              ...(alsoBreached ? { alsoBreached } : {}),
              stateChange: {
                patienceDelta: newState.patienceRemaining! - currentState.patienceRemaining,
                confusionDelta: newState.confusionLevel! - currentState.confusionLevel,
                frustrationDelta: newState.frustrationLevel! - currentState.frustrationLevel,
              },
            }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("list_cognitive_personas", {
    title: "List Cognitive Personas",
    description: "List all available personas with their cognitive traits (includes accessibility and emotional personas)",
    inputSchema: {},
    annotations: {
      title: "List Cognitive Personas",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async () => {
      const builtinNames = listPersonas();
      const accessibilityNames = listAccessibilityPersonas();

      const builtinPersonas = builtinNames.map(name => {
        const p = getPersona(name);
        if (!p) return null;
        const profile = getCognitiveProfile(p);
        const values = resolveValuesForPersona(p.name);
        return {
          name: p.name,
          description: p.description,
          category: "builtin",
          demographics: p.demographics,
          cognitiveTraits: profile.traits,
          attentionPattern: profile.attentionPattern,
          decisionStyle: profile.decisionStyle,
          values: values ? {
            schwartz: {
              selfDirection: values.selfDirection,
              stimulation: values.stimulation,
              hedonism: values.hedonism,
              achievement: values.achievement,
              power: values.power,
              security: values.security,
              conformity: values.conformity,
              tradition: values.tradition,
              benevolence: values.benevolence,
              universalism: values.universalism,
            },
            higherOrder: {
              openness: values.openness,
              selfEnhancement: values.selfEnhancement,
              conservation: values.conservation,
              selfTranscendence: values.selfTranscendence,
            },
            sdt: {
              autonomyNeed: values.autonomyNeed,
              competenceNeed: values.competenceNeed,
              relatednessNeed: values.relatednessNeed,
            },
            maslowLevel: values.maslowLevel,
          } : undefined,
        };
      }).filter(Boolean);

      const accessibilityPersonas = accessibilityNames.map(name => {
        const p = getAccessibilityPersona(name);
        if (!p) return null;
        // Shared with the stdio roster; a declared label wins over inference.
        // (2026-10-07)
        const { disabilityType, barrierTypes } = describeAccessibilityPersona(p);

        const values = resolveValuesForPersona(p.name);
        return {
          name: p.name,
          description: p.description,
          category: "accessibility",
          disabilityType,
          demographics: p.demographics,
          cognitiveTraits: p.cognitiveTraits || {},
          barrierTypes,
          values: values ? {
            schwartz: {
              selfDirection: values.selfDirection,
              stimulation: values.stimulation,
              hedonism: values.hedonism,
              achievement: values.achievement,
              power: values.power,
              security: values.security,
              conformity: values.conformity,
              tradition: values.tradition,
              benevolence: values.benevolence,
              universalism: values.universalism,
            },
            higherOrder: {
              openness: values.openness,
              selfEnhancement: values.selfEnhancement,
              conservation: values.conservation,
              selfTranscendence: values.selfTranscendence,
            },
            sdt: {
              autonomyNeed: values.autonomyNeed,
              competenceNeed: values.competenceNeed,
              relatednessNeed: values.relatednessNeed,
            },
            maslowLevel: values.maslowLevel,
          } : undefined,
        };
      }).filter(Boolean);

      // v18.35.0: Include local custom personas
      const { loadCustomPersonas } = await import("../../personas.js");
      const customPersonaMap = loadCustomPersonas();
      const localCustomPersonas = Object.values(customPersonaMap).map(p => {
        const profile = getCognitiveProfile(p);
        return {
          name: p.name,
          description: p.description,
          category: "custom" as const,
          demographics: p.demographics,
          cognitiveTraits: profile.traits,
          attentionPattern: profile.attentionPattern,
          decisionStyle: profile.decisionStyle,
        };
      });

      // v18.54.0: Include account-scoped custom personas from CMS
      const cmsPersonas = await fetchCustomPersonasFromCMS(_sessionApiKey);
      const cmsCustomPersonas = cmsPersonas.map(p => ({
        name: p.name,
        description: p.description,
        category: "custom" as const,
        source: p.source,
        cognitiveTraits: p.traits,
        values: p.values ? (() => {
          const sv = {
            selfDirection: p.values.selfDirection ?? 0.5,
            stimulation: p.values.stimulation ?? 0.5,
            hedonism: p.values.hedonism ?? 0.5,
            achievement: p.values.achievement ?? 0.5,
            power: p.values.power ?? 0.5,
            security: p.values.security ?? 0.5,
            conformity: p.values.conformity ?? 0.5,
            tradition: p.values.tradition ?? 0.5,
            benevolence: p.values.benevolence ?? 0.5,
            universalism: p.values.universalism ?? 0.5,
          };
          // Delegated to the shared resolver rather than recomputed here.
          //
          // This block had both defects the derivation was fixed for, in one
          // object. `maslowLevel` was the LITERAL "esteem" — so every custom
          // persona in the roster reported esteem regardless of its values,
          // right for six of twelve by coincidence and wrong for the rest by
          // as much as 0.3. And the rollups averaged in the 0.5 placeholders
          // that the live tools now exclude, so the roster and
          // persona_values_lookup disagreed on selfEnhancement for every
          // custom persona (alexa-eden 0.599 here against 0.698 there).
          //
          // Two fixes propagated to the derivation and neither reached this
          // copy, which is the argument against the copy existing. One
          // resolver now answers both, so they cannot drift again.
          // (2026-08-01)
          // Data passed in, not looked up by name. These personas come from
          // the CMS, so in a process whose data dir is not scoped to that
          // account the name resolves to nothing and the resolver reports
          // `source: "none"` -- correct about the lookup, and a lie about a
          // persona whose values are right here in `p.values`. (2026-08-01)
          const resolved = resolvePersonaValues(p.name, {
            values: sv,
            valuesDerivation: (p as { values_derivation?: { method?: string } }).values_derivation
              ?? (p as { valuesDerivation?: { method?: string } }).valuesDerivation
              ?? { method: "traits" },
            traits: p.traits as Record<string, number> | undefined,
          });
          return {
            schwartz: sv,
            higherOrder: resolved.higherOrder ?? {},
            ...(resolved.higherOrderWithImputed
              ? { higherOrderWithImputed: resolved.higherOrderWithImputed }
              : {}),
            sdt: {
              autonomyNeed: p.values.autonomyNeed ?? 0.5,
              competenceNeed: p.values.competenceNeed ?? 0.5,
              relatednessNeed: p.values.relatednessNeed ?? 0.5,
            },
            valuesSource: resolved.source,
            maslowLevel: resolved.maslowLevel,
            ...(resolved.maslowCaveat ? { maslowCaveat: resolved.maslowCaveat } : {}),
            ...(resolved.imputationPolicy ? { imputationPolicy: resolved.imputationPolicy } : {}),
          };
        })() : undefined,
      }));

      // Dedupe by name. listPersonas() returns built-ins UNION the on-disk custom
      // personas, so each disk-custom persona was already emitted in the builtin
      // loop above (mislabelled category "builtin"), then again as "custom", and a
      // third time from the CMS when it had been synced there — 37 rows for ~23
      // real personas.
      //
      // This MERGES rather than replaces. A plain last-write-wins would be lossy:
      // the CMS record carries no demographics / attentionPattern / decisionStyle
      // and holds raw DB traits, so it would silently drop fields the earlier
      // record had, on a tool whose own description advertises "with their
      // cognitive traits". Later records therefore fill in and refine, and the
      // first-seen computed cognitive profile wins over raw CMS traits.
      // (2026-07-28)
      const rawPersonas = [...builtinPersonas, ...accessibilityPersonas, ...localCustomPersonas, ...cmsCustomPersonas]
        .filter(Boolean) as Array<Record<string, unknown>>;

      const byName = new Map<string, Record<string, unknown>>();
      for (const p of rawPersonas) {
        const name = p.name as string;
        const existing = byName.get(name);
        if (!existing) {
          byName.set(name, { ...p });
          continue;
        }
        for (const [key, value] of Object.entries(p)) {
          if (value === undefined || value === null) continue;
          // getCognitiveProfile() output beats the raw traits column.
          if (key === "cognitiveTraits" && existing.cognitiveTraits) continue;
          existing[key] = value;
        }
      }
      const allPersonas = [...byName.values()];
      const countByCategory = (category: string) =>
        allPersonas.filter((p) => p.category === category).length;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              personas: allPersonas,
              count: allPersonas.length,
              categories: {
                builtin: countByCategory("builtin"),
                accessibility: countByCategory("accessibility"),
                custom: countByCategory("custom"),
              },
            }, null, 2),
          },
        ],
      };
    }
  );
}
