/**
 * CBrowser MCP Tools - Values System Tools
 * Schwartz's 10 Universal Values, Self-Determination Theory, Maslow
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer } from "../types.js";
import {
  getPersonaValues,
  PERSONA_VALUE_PROFILES,
  rankInfluencePatternsForProfile,
  INFLUENCE_PATTERNS,
} from "../../values/index.js";

/**
 * Register values system tools (6 tools)
 */
export function registerValuesTools(server: McpServer): void {
  server.tool(
    "persona_values_lookup",
    "Look up the values profile for a persona (Schwartz's 10 Universal Values, SDT needs, Maslow level). Values describe WHO the persona is at a deeper motivational level, informing influence susceptibility.",
    {
      persona: z.string().describe("Persona name (e.g., 'first-timer', 'power-user', 'anxious-user')"),
      includeInfluencePatterns: z.boolean().optional().default(true).describe("Include ranked influence patterns this persona is susceptible to"),
    },
    async ({ persona, includeInfluencePatterns }) => {
      const values = getPersonaValues(persona);

      if (!values) {
        const availablePersonas = PERSONA_VALUE_PROFILES.map(p => p.personaName);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `No values profile found for persona: ${persona}`,
                availablePersonas,
                note: "Values are defined for all built-in personas. Custom personas can have values added via the questionnaire.",
              }, null, 2),
            },
          ],
        };
      }

      const profile = PERSONA_VALUE_PROFILES.find(
        p => p.personaName.toLowerCase() === persona.toLowerCase()
      );

      let influencePatterns: Array<{pattern: string; susceptibility: number; description: string}> | undefined;
      if (includeInfluencePatterns) {
        const ranked = rankInfluencePatternsForProfile(values);
        influencePatterns = ranked.slice(0, 7).map(r => ({
          pattern: r.pattern.name,
          susceptibility: r.susceptibility,
          description: r.pattern.description,
        }));
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              persona,
              rationale: profile?.rationale,
              schwartzValues: {
                selfDirection: { value: values.selfDirection, meaning: "Independent thought, creativity, freedom" },
                stimulation: { value: values.stimulation, meaning: "Excitement, novelty, challenge" },
                hedonism: { value: values.hedonism, meaning: "Pleasure, sensuous gratification" },
                achievement: { value: values.achievement, meaning: "Personal success through competence" },
                power: { value: values.power, meaning: "Social status, prestige, control" },
                security: { value: values.security, meaning: "Safety, harmony, stability" },
                conformity: { value: values.conformity, meaning: "Restraint of actions that harm others" },
                tradition: { value: values.tradition, meaning: "Respect for customs, heritage" },
                benevolence: { value: values.benevolence, meaning: "Welfare of close others" },
                universalism: { value: values.universalism, meaning: "Tolerance, social justice, environment" },
              },
              higherOrderValues: {
                openness: { value: values.openness, meaning: "(selfDirection + stimulation) / 2" },
                selfEnhancement: { value: values.selfEnhancement, meaning: "(achievement + power) / 2" },
                conservation: { value: values.conservation, meaning: "(security + conformity + tradition) / 3" },
                selfTranscendence: { value: values.selfTranscendence, meaning: "(benevolence + universalism) / 2" },
              },
              selfDeterminationTheory: {
                autonomyNeed: { value: values.autonomyNeed, meaning: "Need for choice and control" },
                competenceNeed: { value: values.competenceNeed, meaning: "Need to feel capable" },
                relatednessNeed: { value: values.relatednessNeed, meaning: "Need for connection" },
              },
              maslowLevel: {
                level: values.maslowLevel,
                meaning: values.maslowLevel === "physiological" ? "Basic survival needs"
                  : values.maslowLevel === "safety" ? "Security and stability"
                  : values.maslowLevel === "belonging" ? "Social connection and love"
                  : values.maslowLevel === "esteem" ? "Achievement and recognition"
                  : "Self-fulfillment and growth",
              },
              influencePatterns,
              researchBasis: {
                schwartz: "Schwartz, S. H. (1992, 2012). Theory of Basic Human Values. DOI: 10.1016/S0065-2601(08)60281-6",
                sdt: "Deci, E. L., & Ryan, R. M. (1985, 2000). Self-Determination Theory. DOI: 10.1037/0003-066X.55.1.68",
                maslow: "Maslow, A. H. (1943). A Theory of Human Motivation. DOI: 10.1037/h0054346",
              },
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "list_influence_patterns",
    "List all research-backed influence/persuasion patterns and which persona values make someone susceptible to each pattern. Based on Cialdini, Kahneman, and behavioral economics research.",
    {},
    async () => {
      const patterns = INFLUENCE_PATTERNS.map(pattern => ({
        name: pattern.name,
        description: pattern.description,
        researchBasis: pattern.researchBasis,
        targetValues: pattern.targetValues,
        mechanism: pattern.mechanism,
        examples: pattern.examples,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              count: patterns.length,
              patterns,
              usage: "Use persona_values_lookup to see which patterns a specific persona is susceptible to",
              note: "These patterns describe psychological influence mechanisms. Use ethically for UX optimization, not manipulation.",
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "persona_questionnaire_get",
    "Get the persona questionnaire for building a custom persona. Returns research-backed questions that map to cognitive traits. Use comprehensive=true for all 25 traits, or leave false for 8 core traits. v16.12.0: Now includes optional category question for disability-specific value safeguards.",
    {
      comprehensive: z.boolean().optional().default(false).describe("Include all 25 traits (true) or just 8 core traits (false)"),
      traits: z.array(z.string()).optional().describe("Specific trait names to include (overrides comprehensive)"),
      includeCategory: z.boolean().optional().default(true).describe("Include category question for disability-aware values (v16.12.0)"),
    },
    async ({ comprehensive, traits, includeCategory }) => {
      const { generatePersonaQuestionnaire, formatForAskUserQuestion, CATEGORY_QUESTION } = await import("../../persona-questionnaire.js");

      const questions = generatePersonaQuestionnaire({
        comprehensive,
        traits: traits as Array<keyof import("../../types.js").CognitiveTraits> | undefined,
      });

      const formatted = formatForAskUserQuestion(questions);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              instructions: "Present these questions to the user one at a time or all at once. Each answer maps to a trait value. After collecting answers, use persona_questionnaire_build to create the persona. v16.12.0: Start with the category question to enable disability-aware value safeguards.",
              questionCount: questions.length,
              questions: formatted,
              rawQuestions: questions,
              ...(includeCategory && {
                categoryQuestion: CATEGORY_QUESTION,
                categoryInstructions: "Ask this FIRST to determine persona category. The category affects which values are applied and provides research-based safeguards for disability simulations.",
              }),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "persona_questionnaire_build",
    "Build a custom persona from questionnaire answers with category-aware value safeguards. Answers should be a map of trait names to values (0-1). Missing traits will use intelligent defaults based on research correlations. v16.12.0: Optionally specify category for disability-specific value handling.",
    {
      name: z.string().describe("Name for the new persona"),
      description: z.string().describe("Description of the persona"),
      answers: z.record(z.string(), z.number()).describe("Map of trait names to values (0-1), e.g. {patience: 0.25, riskTolerance: 0.75}"),
      category: z.enum(["cognitive", "physical", "sensory", "emotional", "general"]).optional().describe("Persona category for value safeguards (v16.12.0)"),
      valueOverrides: z.record(z.string(), z.number()).optional().describe("Override specific values (0-1) if different from category defaults"),
      save: z.boolean().optional().default(true).describe("Save the persona to disk for future use"),
    },
    async ({ name, description, answers, category, valueOverrides, save }) => {
      const {
        buildTraitsFromAnswers,
        getTraitLabel,
        getTraitBehaviors,
        detectPersonaCategory,
        buildValuesFromCategory,
        validateCategoryValues,
      } = await import("../../persona-questionnaire.js");
      const { createCognitivePersona, saveCustomPersona } = await import("../../personas.js");

      const detectedCategory = category || detectPersonaCategory(name, description);
      const traits = buildTraitsFromAnswers(answers);
      const categoryResult = buildValuesFromCategory(
        detectedCategory,
        valueOverrides as Record<string, number> | undefined,
        traits
      );
      const warnings = validateCategoryValues(detectedCategory, categoryResult.values);
      const persona = createCognitivePersona(name, description, traits, {});

      let savedPath: string | undefined;
      if (save) {
        savedPath = saveCustomPersona(persona);
      }

      const traitSummary: Record<string, { value: number; label: string; behaviors: string[] }> = {};
      for (const [trait, value] of Object.entries(traits)) {
        if (value !== 0.5) {
          traitSummary[trait] = {
            value: value as number,
            label: getTraitLabel(trait as keyof import("../../types.js").CognitiveTraits, value as number),
            behaviors: getTraitBehaviors(trait as keyof import("../../types.js").CognitiveTraits, value as number),
          };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              persona: {
                name: persona.name,
                description: persona.description,
                demographics: persona.demographics,
              },
              cognitiveTraits: traits,
              traitSummary,
              category: {
                detected: detectedCategory,
                strategy: categoryResult.valueStrategy,
                guidance: categoryResult.guidance,
              },
              values: categoryResult.values,
              researchBasis: categoryResult.researchBasis,
              ...(categoryResult.derivations && categoryResult.derivations.length > 0 && {
                valueDerivations: categoryResult.derivations,
              }),
              ...(warnings.length > 0 && { warnings }),
              savedPath,
              usage: `Use persona "${name}" with cognitive-journey or other commands`,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "persona_trait_lookup",
    "Look up behavioral descriptions for specific trait values. Useful for understanding what a trait value means in practice.",
    {
      trait: z.string().describe("Trait name (e.g., 'patience', 'riskTolerance')"),
      value: z.number().min(0).max(1).describe("Trait value (0-1)"),
    },
    async ({ trait, value }) => {
      const { getTraitReference, getTraitLabel, getTraitBehaviors } = await import("../../persona-questionnaire.js");

      const reference = getTraitReference(trait as keyof import("../../types.js").CognitiveTraits);

      if (!reference) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Unknown trait: ${trait}`,
                availableTraits: [
                  "patience", "riskTolerance", "comprehension", "persistence", "curiosity",
                  "workingMemory", "readingTendency", "resilience", "selfEfficacy", "satisficing",
                  "trustCalibration", "interruptRecovery", "informationForaging", "changeBlindness",
                  "anchoringBias", "timeHorizon", "attributionStyle", "metacognitivePlanning",
                  "proceduralFluency", "transferLearning", "authoritySensitivity", "emotionalContagion",
                  "fearOfMissingOut", "socialProofSensitivity", "mentalModelRigidity"
                ],
              }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              trait: reference.name,
              description: reference.description,
              researchBasis: reference.researchBasis,
              value,
              label: getTraitLabel(trait as keyof import("../../types.js").CognitiveTraits, value),
              behaviors: getTraitBehaviors(trait as keyof import("../../types.js").CognitiveTraits, value),
              allLevels: reference.levels,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "persona_category_guidance",
    "Get guidance for value assignment based on persona category. (v16.12.0) Explains research basis for why cognitive, physical, sensory, and emotional disability categories require different value handling approaches.",
    {
      category: z.enum(["cognitive", "physical", "sensory", "emotional", "general"]).describe("Persona category to get guidance for"),
    },
    async ({ category }) => {
      const { CATEGORY_VALUE_PRESETS, COGNITIVE_SUBTYPES } = await import("../../persona-questionnaire.js");

      const preset = CATEGORY_VALUE_PRESETS.find(p => p.category === category);

      if (!preset) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Unknown category: ${category}`,
                availableCategories: ["cognitive", "physical", "sensory", "emotional", "general"],
              }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              category: preset.category,
              description: preset.description,
              valueStrategy: preset.valueStrategy,
              guidance: preset.guidance,
              defaultValues: preset.defaultValues,
              researchBasis: preset.researchBasis,
              ...(category === "cognitive" && {
                subtypes: Object.entries(COGNITIVE_SUBTYPES).map(([key, subtype]) => ({
                  name: key,
                  values: subtype.values,
                  researchBasis: subtype.researchBasis,
                })),
              }),
            }, null, 2),
          },
        ],
      };
    }
  );
}
