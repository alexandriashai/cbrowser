/**
 * CBrowser MCP Tools - Persona Creation Tools
 *
 * 7 tools for guided persona creation using AskUserQuestion patterns:
 * - persona_create_start
 * - persona_create_questionnaire_start
 * - persona_create_questionnaire_answer
 * - persona_create_from_description
 * - persona_create_submit_traits
 * - persona_create_cancel
 * - persona_traits_list
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer } from "./types.js";
import {
  generatePersonaQuestionnaire,
  buildTraitsFromAnswers,
  buildBigFiveFromAnswers,
  deriveValuesFromTraits,
  TRAIT_REFERENCE_MATRIX,
} from "../persona-questionnaire.js";
import type { CognitiveTraits } from "../types.js";
import { bigFiveInferenceReference, validateInferredBigFive } from "../values/big-five-inference.js";
import { deriveValuesFromBigFive } from "../values/big-five-values.js";
import { TRAIT_INFERENCE_CRITERIA, ALL_TRAITS, assessTraitCompleteness } from "../values/persona-completeness.js";
import { summariseTraits } from "../values/persona-diff.js";
import { widgetUri } from "./widget-kit.js";

// ============================================================================
// Schwartz Values Questions for Persona Questionnaire
// ============================================================================

interface ValueQuestion {
  id: string;
  value: string;
  question: string;
  options: Array<{ value: number; label: string; description: string }>;
}

const VALUES_QUESTIONS: ValueQuestion[] = [
  {
    id: "security",
    value: "security",
    question: "How important is safety and stability to this persona?",
    options: [
      { value: 0.0, label: "Not Important", description: "Takes risks freely, ignores safety warnings" },
      { value: 0.33, label: "Somewhat Important", description: "Balances caution with convenience" },
      { value: 0.67, label: "Important", description: "Prefers familiar, trusted options" },
      { value: 1.0, label: "Very Important", description: "Prioritizes security over convenience always" },
    ],
  },
  {
    id: "stimulation",
    value: "stimulation",
    question: "How much does this persona seek novelty and excitement?",
    options: [
      { value: 0.0, label: "Avoids Novelty", description: "Prefers routine, dislikes surprises" },
      { value: 0.33, label: "Mild Interest", description: "Occasionally tries new things" },
      { value: 0.67, label: "Seeks Novelty", description: "Enjoys exploring new features and options" },
      { value: 1.0, label: "Thrives on Novelty", description: "Always first to try new things, loves surprises" },
    ],
  },
  {
    id: "achievement",
    value: "achievement",
    question: "How driven is this persona to succeed and accomplish goals?",
    options: [
      { value: 0.0, label: "Not Driven", description: "Goes with the flow, not goal-oriented" },
      { value: 0.33, label: "Casually Motivated", description: "Has goals but doesn't stress about them" },
      { value: 0.67, label: "Goal-Oriented", description: "Works hard to achieve objectives" },
      { value: 1.0, label: "Highly Ambitious", description: "Intensely focused on success and achievement" },
    ],
  },
  {
    id: "conformity",
    value: "conformity",
    question: "How much does this persona follow social norms and expectations?",
    options: [
      { value: 0.0, label: "Independent", description: "Ignores norms, does things their own way" },
      { value: 0.33, label: "Flexible", description: "Generally follows norms but makes exceptions" },
      { value: 0.67, label: "Conventional", description: "Follows established practices and expectations" },
      { value: 1.0, label: "Strongly Conforming", description: "Strictly adheres to all social norms" },
    ],
  },
  {
    id: "selfDirection",
    value: "selfDirection",
    question: "How important is independence and autonomy to this persona?",
    options: [
      { value: 0.0, label: "Prefers Guidance", description: "Likes being told what to do" },
      { value: 0.33, label: "Accepts Guidance", description: "Follows instructions but has preferences" },
      { value: 0.67, label: "Values Independence", description: "Prefers to figure things out themselves" },
      { value: 1.0, label: "Strongly Independent", description: "Must have control over their own choices" },
    ],
  },
  {
    id: "hedonism",
    value: "hedonism",
    question: "How important is pleasure and enjoyment to this persona?",
    options: [
      { value: 0.0, label: "Utilitarian", description: "Focused on function, not pleasure" },
      { value: 0.33, label: "Balanced", description: "Appreciates nice experiences but not a priority" },
      { value: 0.67, label: "Pleasure-Seeking", description: "Enjoys aesthetics, comfort, and fun" },
      { value: 1.0, label: "Highly Hedonistic", description: "Prioritizes enjoyment and sensory pleasure" },
    ],
  },
  {
    id: "power",
    value: "power",
    question: "How important is status and control to this persona?",
    options: [
      { value: 0.0, label: "Humble", description: "Avoids status symbols, prefers equality" },
      { value: 0.33, label: "Modest", description: "Accepts some recognition but doesn't seek it" },
      { value: 0.67, label: "Status-Conscious", description: "Values recognition and influence" },
      { value: 1.0, label: "Power-Oriented", description: "Strongly motivated by prestige and control" },
    ],
  },
  {
    id: "tradition",
    value: "tradition",
    question: "How important are customs and traditional ways to this persona?",
    options: [
      { value: 0.0, label: "Progressive", description: "Rejects tradition, embraces change" },
      { value: 0.33, label: "Flexible", description: "Respects some traditions, open to new ways" },
      { value: 0.67, label: "Traditional", description: "Values established customs and practices" },
      { value: 1.0, label: "Strongly Traditional", description: "Deeply committed to preserving traditions" },
    ],
  },
  {
    id: "benevolence",
    value: "benevolence",
    question: "How caring is this persona toward people they know?",
    options: [
      { value: 0.0, label: "Self-Focused", description: "Prioritizes own needs over others" },
      { value: 0.33, label: "Occasionally Helpful", description: "Helps when convenient" },
      { value: 0.67, label: "Caring", description: "Regularly helps friends, family, colleagues" },
      { value: 1.0, label: "Highly Benevolent", description: "Deeply devoted to helping close others" },
    ],
  },
  {
    id: "universalism",
    value: "universalism",
    question: "How much does this persona care about broader social and environmental issues?",
    options: [
      { value: 0.0, label: "Indifferent", description: "Focused on personal/local concerns only" },
      { value: 0.33, label: "Aware", description: "Acknowledges issues but limited action" },
      { value: 0.67, label: "Concerned", description: "Actively cares about society and environment" },
      { value: 1.0, label: "Deeply Committed", description: "Strong advocate for social justice and sustainability" },
    ],
  },
];

// ============================================================================
// Session-Based Persona Questionnaire State
// ============================================================================

interface AnswerMetadata {
  value: number;
  answeredAt: number;
  questionIndex: number;
  phase: "traits" | "values";
}

interface QuestionnaireSession {
  personaName: string;
  questions: ReturnType<typeof generatePersonaQuestionnaire>;
  valueQuestions: ValueQuestion[];
  answers: Record<string, number>;
  valueAnswers: Record<string, number>;
  answerMetadata: Record<string, AnswerMetadata>;
  currentIndex: number;
  phase: "traits" | "values";
  comprehensive: boolean;
  startedAt: number;
  lastQuestionAskedAt: number;
}

// In-memory session storage (per-server)
const questionnaireSessionsMap = new Map<string, QuestionnaireSession>();

function getQuestionnaireSession(sessionId: string): QuestionnaireSession | null {
  return questionnaireSessionsMap.get(sessionId) || null;
}

function setQuestionnaireSession(sessionId: string, session: QuestionnaireSession): void {
  questionnaireSessionsMap.set(sessionId, session);
}

function clearQuestionnaireSession(sessionId: string): void {
  questionnaireSessionsMap.delete(sessionId);
}

function getSessionId(): string {
  // In a real implementation, this would come from request context
  return "default-session";
}

function getTraitHeader(trait: string): string {
  const headers: Record<string, string> = {
    patience: "Patience",
    riskTolerance: "Risk",
    comprehension: "Comprehension",
    persistence: "Persistence",
    curiosity: "Curiosity",
    workingMemory: "Memory",
    readingTendency: "Reading",
    resilience: "Resilience",
    selfEfficacy: "Confidence",
    satisficing: "Decisions",
    trustCalibration: "Trust",
    interruptRecovery: "Focus",
    informationForaging: "Search Style",
    changeBlindness: "Awareness",
    anchoringBias: "Anchoring",
    timeHorizon: "Time Focus",
    attributionStyle: "Attribution",
    metacognitivePlanning: "Planning",
    proceduralFluency: "Procedures",
    transferLearning: "Transfer",
    authoritySensitivity: "Authority",
    emotionalContagion: "Emotional",
    fearOfMissingOut: "FOMO",
    socialProofSensitivity: "Social Proof",
    mentalModelFlexibility: "Flexibility",
  };
  return headers[trait] || trait;
}

function convertToThirdPerson(question: string, personaName: string): string {
  let result = question
    .replace(/When you encounter a confusing website, how long do you typically try/i,
      `When this persona encounters a confusing website, how long does this persona typically try`)
    .replace(/How comfortable are you clicking/i, `How comfortable is this persona clicking`)
    .replace(/How easily do you understand/i, `How easily does this persona understand`)
    .replace(/When something doesn't work the first time, what do you usually do/i,
      `When something doesn't work the first time, what does this persona usually do`)
    .replace(/While completing a task online, how often do you explore/i,
      `While completing a task, how often does this persona explore`)
    .replace(/How well do you remember/i, `How well does this persona remember`)
    .replace(/How much of a webpage's text do you typically read/i,
      `How much of a webpage's text does this persona typically read`)
    .replace(/After encountering an error or frustrating experience, how quickly do you recover/i,
      `After encountering an error, how quickly does this persona recover`)
    .replace(/How confident are you in your ability/i, `How confident is this persona in their ability`);

  result = result
    .replace(/\bdo you\b/gi, "does this persona")
    .replace(/\bare you\b/gi, "is this persona")
    .replace(/\byou're\b/gi, "this persona is")
    .replace(/\byou've\b/gi, "they have")
    .replace(/\byou'd\b/gi, "they would")
    .replace(/\byour\b/gi, "their")
    .replace(/\byou\b/gi, "they");

  return result;
}

/**
 * Register persona creation tools (7 tools)
 */
export function registerPersonaCreationTools(server: McpServer): void {
  server.registerTool("persona_create_start", {
    title: "Start Persona Creation",
    description: "Start creating a custom persona. Best practice: present the choice to the user via AskUserQuestion (questionnaire vs description mode) rather than showing raw JSON.",
    inputSchema: {
      persona_name: z.string().describe("Name for the new persona (e.g., 'tech-savvy-millennial')"),
      comprehensive: z.boolean().optional().describe("Include all 26 traits (true) or just core 8 traits (false, default)"),
    },
    annotations: {
      title: "Start Persona Creation",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async ({ persona_name, comprehensive = false }) => {
      const sessionId = getSessionId();

      const existingSession = getQuestionnaireSession(sessionId);
      if (existingSession) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              warning: "A questionnaire session is already in progress",
              existing_persona: existingSession.personaName,
              progress: `${existingSession.currentIndex}/${existingSession.questions.length} questions answered`,
              options: [
                "Use persona_create_questionnaire_answer to continue the current questionnaire",
                "Use persona_create_cancel to discard and start fresh",
              ],
            }, null, 2),
          }],
        };
      }

      const traitCount = comprehensive ? 25 : 8;
      const valueCount = VALUES_QUESTIONS.length;
      const totalQuestions = traitCount + valueCount;

      return {
        content: [{
          type: "text",
          text: `ACTION REQUIRED: Use your AskUserQuestion tool to ask the user:

Question: "How would you like to create the '${persona_name}' persona?"
Header: "Create Mode"

Options:
1. "Fill out questionnaire (Recommended)" - Answer ${totalQuestions} questions about this persona's cognitive traits and values.
2. "Describe the persona" - Provide a text description and I'll infer appropriate trait and value settings.

After the user chooses:
- If "questionnaire": Call persona_create_questionnaire_start with persona_name="${persona_name}" and comprehensive=${comprehensive}
- If "describe": Ask the user to describe the persona, then call persona_create_from_description

IMPORTANT: Do NOT show this text to the user. USE AskUserQuestion to present the choice interactively.`,
        }],
      };
    }
  );

  server.registerTool("persona_create_questionnaire_start", {
    title: "Start Persona Questionnaire",
    description: "Start the questionnaire mode for persona creation. Each question is best presented via AskUserQuestion for interactive selection.",
    inputSchema: {
      persona_name: z.string().describe("Name for the new persona"),
      comprehensive: z.boolean().optional().describe("Include all 26 traits (default: false, core 8 traits only)"),
    },
    annotations: {
      title: "Start Persona Questionnaire",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async ({ persona_name, comprehensive = false }) => {
      const sessionId = getSessionId();
      const rawQuestions = generatePersonaQuestionnaire({ comprehensive });

      const session: QuestionnaireSession = {
        personaName: persona_name,
        questions: rawQuestions,
        valueQuestions: VALUES_QUESTIONS,
        answers: {},
        valueAnswers: {},
        answerMetadata: {},
        currentIndex: 0,
        phase: "traits",
        comprehensive,
        startedAt: Date.now(),
        lastQuestionAskedAt: Date.now(),
      };
      setQuestionnaireSession(sessionId, session);

      const firstQuestion = rawQuestions[0];
      const thirdPersonQuestion = convertToThirdPerson(firstQuestion.question, persona_name);
      const totalQuestions = rawQuestions.length + VALUES_QUESTIONS.length;

      return {
        content: [{
          type: "text",
          text: `ACTION REQUIRED: Use your AskUserQuestion tool to ask about the "${persona_name}" persona.

Question 1 of ${totalQuestions} (Trait: ${firstQuestion.trait})
"${thirdPersonQuestion}"

Header: "${firstQuestion.trait ? getTraitHeader(firstQuestion.trait) : firstQuestion.id}"

Options:
${firstQuestion.options.map((o, i) => `${i + 1}. "${o.label}" - ${o.description}`).join("\n")}

After the user selects an option, call persona_create_questionnaire_answer with answer_value set to the option's value.

IMPORTANT: Use AskUserQuestion - do NOT just display this text.`,
        }],
      };
    }
  );

  server.registerTool("persona_create_questionnaire_answer", {
    title: "Answer Questionnaire Question",
    description: "Submit an answer for the current questionnaire question. Returns instructions for the next question, or completed persona when done.",
    inputSchema: {
      answer_value: z.number().min(0).max(1).describe("The value selected (0.0, 0.25, 0.33, 0.67, 0.75, or 1.0)"),
    },
    annotations: {
      title: "Answer Questionnaire Question",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async ({ answer_value }) => {
      const sessionId = getSessionId();
      const session = getQuestionnaireSession(sessionId);

      if (!session) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "No questionnaire session in progress",
              instruction: "Start a new questionnaire with persona_create_questionnaire_start",
            }, null, 2),
          }],
        };
      }

      const totalQuestions = session.questions.length + session.valueQuestions.length;
      const now = Date.now();

      if (session.phase === "traits") {
        const currentQuestion = session.questions[session.currentIndex];
        // Keyed by id so Big Five items, which carry no trait, land somewhere
        // real. For a trait question id and trait are the same string.
        session.answers[currentQuestion.id] = answer_value;
        session.answerMetadata[currentQuestion.id] = {
          value: answer_value,
          answeredAt: now,
          questionIndex: session.currentIndex,
          phase: "traits",
        };
        session.currentIndex++;

        if (session.currentIndex >= session.questions.length) {
          session.phase = "values";
          session.currentIndex = 0;
        }
      } else {
        const currentValueQ = session.valueQuestions[session.currentIndex];
        session.valueAnswers[currentValueQ.value] = answer_value;
        session.answerMetadata[currentValueQ.value] = {
          value: answer_value,
          answeredAt: now,
          questionIndex: session.currentIndex,
          phase: "values",
        };
        session.currentIndex++;
      }

      session.lastQuestionAskedAt = now;

      // Check if completely done
      if (session.phase === "values" && session.currentIndex >= session.valueQuestions.length) {
        const traits = buildTraitsFromAnswers(session.answers);
        // Big Five answers, if the questionnaire included them. Kept on the
        // persona so anything deriving values later has the layer the research
        // actually relates to values, rather than re-deriving from cognitive
        // traits and crossing a gap the literature does not cover. Without
        // this the five items would have been asked and thrown away.
        // (2026-08-01)
        const bigFive = buildBigFiveFromAnswers(session.answers);
        const derivedResult = deriveValuesFromTraits(traits);
        const derivedValues = derivedResult.values;
        const values = {
          selfDirection: session.valueAnswers.selfDirection ?? derivedValues.selfDirection ?? 0.5,
          stimulation: session.valueAnswers.stimulation ?? derivedValues.stimulation ?? 0.5,
          hedonism: session.valueAnswers.hedonism ?? derivedValues.hedonism ?? 0.5,
          achievement: session.valueAnswers.achievement ?? derivedValues.achievement ?? 0.5,
          power: session.valueAnswers.power ?? derivedValues.power ?? 0.5,
          security: session.valueAnswers.security ?? derivedValues.security ?? 0.5,
          conformity: session.valueAnswers.conformity ?? derivedValues.conformity ?? 0.5,
          tradition: session.valueAnswers.tradition ?? derivedValues.tradition ?? 0.5,
          benevolence: session.valueAnswers.benevolence ?? derivedValues.benevolence ?? 0.5,
          universalism: session.valueAnswers.universalism ?? derivedValues.universalism ?? 0.5,
        };

        const personaName = session.personaName;
        const duration = Date.now() - session.startedAt;
        clearQuestionnaireSession(sessionId);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              questionnaire_complete: true,
              persona_name: personaName,
              ...(Object.keys(bigFive).length ? { bigFive } : {}),
              duration_seconds: Math.round(duration / 1000),
              traits,
              values,
              instruction: "Persona has been created with traits AND values. You can now use this persona with cognitive_journey_init.",
            }, null, 2),
          }],
        };
      }

      // Get the next question
      const answeredCount = session.phase === "traits"
        ? session.currentIndex
        : session.questions.length + session.currentIndex;

      if (session.phase === "traits") {
        const nextQuestion = session.questions[session.currentIndex];
        const thirdPersonQuestion = convertToThirdPerson(nextQuestion.question, session.personaName);
        setQuestionnaireSession(sessionId, session);

        return {
          content: [{
            type: "text",
            text: `ACTION REQUIRED: Use your AskUserQuestion tool.

Question ${answeredCount + 1} of ${totalQuestions} (Trait: ${nextQuestion.trait})
"${thirdPersonQuestion}"

Header: "${nextQuestion.trait ? getTraitHeader(nextQuestion.trait) : nextQuestion.id}"

Options:
${nextQuestion.options.map((o, i) => `${i + 1}. "${o.label}" - ${o.description}`).join("\n")}

Progress: ${Math.round((answeredCount / totalQuestions) * 100)}% complete`,
          }],
        };
      } else {
        const nextValueQ = session.valueQuestions[session.currentIndex];
        setQuestionnaireSession(sessionId, session);

        return {
          content: [{
            type: "text",
            text: `ACTION REQUIRED: Use your AskUserQuestion tool.

Question ${answeredCount + 1} of ${totalQuestions} (Value: ${nextValueQ.value})
"${nextValueQ.question}"

Header: "${nextValueQ.value.charAt(0).toUpperCase() + nextValueQ.value.slice(1)}"

Options:
${nextValueQ.options.map((o, i) => `${i + 1}. "${o.label}" - ${o.description}`).join("\n")}

Progress: ${Math.round((answeredCount / totalQuestions) * 100)}% complete
Phase: VALUES (${session.currentIndex + 1} of ${session.valueQuestions.length})`,
          }],
        };
      }
    }
  );

  server.registerTool("persona_create_from_description", {
    title: "Create Persona from Description",
    description: "Create a persona from a text description. Returns trait reference matrix for Claude to infer appropriate values.",
    inputSchema: {
      persona_name: z.string().describe("Name for the new persona"),
      description: z.string().describe("Text description of the persona (e.g., 'An impatient power user who skims content')"),
      includeTraitReference: z.boolean().optional().default(false).describe("Return the full trait reference matrix with per-level behaviours (~7k tokens, same content as persona_traits_list). Off by default; a compact name+meaning reference is always included."),
    },
    annotations: {
      title: "Create Persona from Description",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async ({ persona_name, description, includeTraitReference }) => {
      // The full matrix is every trait crossed with every level and its
      // behaviours — roughly 7k tokens, duplicating persona_traits_list, and it
      // shipped on every call. The instruction below genuinely needs something
      // to infer against, so the default is the compact form (name + meaning)
      // rather than nothing, with the full matrix behind a flag. (2026-07-29)
      const traitInfo = includeTraitReference
        ? TRAIT_REFERENCE_MATRIX.map(trait => ({
            name: trait.name,
            description: trait.description,
            levels: trait.levels.map(l => ({
              value: l.value,
              label: l.label,
              behaviors: l.behaviors.slice(0, 2),
            })),
          }))
        : TRAIT_REFERENCE_MATRIX.map(trait => ({
            name: trait.name,
            description: trait.description,
          }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            mode: "manual_inference",
            persona_name,
            user_description: description,
            instruction: `Based on the user's description, infer appropriate trait values (0.0 to 1.0) for each cognitive trait. ALSO estimate the persona's Big Five profile from the same description and return it as bigFive with bigFiveEvidence — see big_five_inference below. This is not optional decoration: without it the persona's values are derived from cognitive traits, and that route cannot reach hedonism, power, universalism or the relatedness need, so those four stay at the 0.5 baseline. Use the trait reference matrix below to guide your inference. If the description mentions ANY disability or impairment — sensory (vision loss, colour blindness, hearing loss), physical (motor impairment, tremor), OR cognitive and attentional (ADHD, dyslexia, autism, brain fog, fatigue, low processing speed) — you MUST also include accessibilityTraits. Cognitive conditions map onto attentionSpan and processingSpeed in that same block; listing only physical and sensory examples led to ADHD personas getting no accessibility modeling at all. Without accessibilityTraits, the persona gets cognitive-only modeling and the perceptual transport layer will report near-perfect perception — which is wrong for someone with a disability. Return the traits via persona_create_submit_traits.`,
            trait_reference: traitInfo,
            big_five_inference: bigFiveInferenceReference(),
            // What to look for, per trait, so the caller is not guessing at
            // what counts as evidence. The submit tool REJECTS a persona with
            // unaccounted traits, so this is the contract rather than advice.
            trait_criteria: TRAIT_INFERENCE_CRITERIA,
            completeness_contract: {
              rule: `All ${ALL_TRAITS.length} traits must be accounted for. Give each one a value inferred from the description, OR list it in unsupportedTraits.`,
              why: "An unsupplied trait is filled from a population baseline and the result is indistinguishable from a considered value — the persona looks complete either way. Naming what the description cannot support keeps that visible.",
              unsupportedTraits: "string[] — traits this description genuinely does not speak to. A legitimate answer, not a failure.",
              enforcement: "persona_create_submit_traits returns an error listing the unaccounted traits and writes nothing.",
            },
            ...(includeTraitReference ? {} : { trait_reference_note: "Compact form: trait names and meanings. For per-level behaviours call persona_traits_list, or pass includeTraitReference:true." }),
            accessibility_traits_reference: {
              visionLevel: "0=blind, 0.3=legally blind, 0.5=low vision (needs magnification), 0.7=mild vision loss, 1.0=sighted",
              contrastSensitivity: "0=needs very high contrast (7:1+), 0.5=needs elevated contrast, 1.0=normal",
              colorBlindness: "red-green (deuteranopia/protanopia), blue-yellow (tritanopia), monochrome (achromatopsia), or omit if none",
              motorControl: "0=severe impairment (can barely click), 0.3=significant difficulty, 0.5=moderate (slow, imprecise), 0.7=mild, 1.0=full control",
              tremor: "true if involuntary hand movement (Parkinson's, essential tremor, etc.)",
              processingSpeed: "0=very slow (needs 5x more time), 0.5=moderate, 1.0=fast",
              attentionSpan: "0=very short (< 30 seconds sustained focus), 0.5=moderate, 1.0=sustained",
              hearingLevel: "0=deaf, 0.5=hard of hearing, 1.0=full hearing",
            },
            example_output: {
              traits: {
                patience: 0.8,
                riskTolerance: 0.25,
                comprehension: 0.6,
                persistence: 0.7,
                curiosity: 0.3,
                workingMemory: 0.5,
                readingTendency: 0.9,
              },
              accessibilityTraits: {
                visionLevel: 0.4,
                contrastSensitivity: 0.3,
                motorControl: 0.7,
                processingSpeed: 0.5,
              },
              ageRange: "65+",
            },
            follow_up_tool: "persona_create_submit_traits",
          }, null, 2),
        }],
      };
    }
  );

  server.registerTool("persona_create_submit_traits", {
    title: "Submit Persona Traits",
    description: "Submit inferred traits for a persona created from description. Use after persona_create_from_description. For disability personas, include accessibilityTraits to enable sensory/motor modeling in empathy_audit.",
    inputSchema: {
      persona_name: z.string().describe("Name for the persona"),
      traits: z.record(z.string(), z.number()).describe("Map of cognitive trait names to values (0-1)"),
      description: z.string().optional().describe("Original description for reference"),
      accessibilityTraits: z.object({
        visionLevel: z.number().min(0).max(1).optional().describe("Vision level: 0=blind, 0.5=low vision, 1=sighted"),
        contrastSensitivity: z.number().min(0).max(1).optional().describe("Contrast sensitivity: 0=needs very high contrast, 1=normal"),
        colorBlindness: z.enum(["red-green", "blue-yellow", "monochrome"]).optional().describe("Type of color blindness, if any"),
        motorControl: z.number().min(0).max(1).optional().describe("Motor control: 0=severe impairment, 1=full control"),
        tremor: z.boolean().optional().describe("Has hand tremor (Parkinson's, essential tremor)"),
        processingSpeed: z.number().min(0).max(1).optional().describe("Information processing speed: 0=very slow, 1=fast"),
        attentionSpan: z.number().min(0).max(1).optional().describe("Focus duration before fatigue: 0=very short, 1=sustained"),
        hearingLevel: z.number().min(0).max(1).optional().describe("Hearing level: 0=deaf, 1=full hearing"),
      }).optional().describe("Sensory/motor/physical traits for disability modeling. Without these, the persona gets cognitive-only modeling (no vision/motor simulation in empathy_audit)."),
      ageRange: z.string().optional().describe("Age range: '18-24', '25-45', '45-65', '65+'"),
      discardBigFive: z.boolean().optional().describe("Deliberately drop an existing Big Five profile on this persona and derive values from cognitive traits instead. Without this, an existing profile is carried forward rather than silently downgraded — omitting bigFive on a rewrite used to demote the persona from thirteen value axes to nine and say nothing."),
      traitProvenance: z.record(z.string(), z.enum(["supported", "asserted"])).optional().describe("Per trait: 'supported' if the description says it, 'asserted' if you decided it anyway. Both are legitimate. Supplying this is what makes the trait count mean something — '26 of 26 supplied' reads as quality whether the values were read out of the description or invented, and without this field nothing can tell those apart."),
      unsupportedTraits: z.array(z.string()).optional().describe("Traits the description genuinely does not speak to. Required for any trait you are not supplying a value for — see completeness_contract. Naming them is a valid answer; omitting them is not."),
      bigFive: z.object({
        openness: z.number().min(0).max(1),
        conscientiousness: z.number().min(0).max(1),
        extraversion: z.number().min(0).max(1),
        agreeableness: z.number().min(0).max(1),
        neuroticism: z.number().min(0).max(1),
      }).optional().describe("Big Five profile INFERRED from the description. Unlocks all 13 motivational values through published correlations instead of the 9 the cognitive-trait route reaches. Requires bigFiveEvidence."),
      bigFiveEvidence: z.array(z.object({
        factor: z.string(),
        score: z.number().min(0).max(1),
        quote: z.string().describe("The words in the description justifying this score"),
      })).optional().describe("One entry per factor, quoting the description. Required whenever bigFive is supplied — an estimate nobody can check against the source is not evidence."),
    },
    _meta: { ui: { resourceUri: widgetUri("persona-created") } },
    annotations: {
      title: "Submit Persona Traits",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async ({ persona_name, traits, description, accessibilityTraits, ageRange, bigFive, bigFiveEvidence, unsupportedTraits, traitProvenance, discardBigFive }) => {
      // Refused, not warned.
      //
      // A warning is read once by a model already moving to its next call, and
      // the persona is written regardless -- the gap surfaces months later when
      // someone audits. Five personas on this install are missing the same four
      // traits because one session skipped them and nothing objected. Declining
      // the write is the only version of this that changes what gets stored.
      const completeness = assessTraitCompleteness(traits, unsupportedTraits, traitProvenance);
      if (!completeness.ok) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({
            error: "incomplete_persona",
            message: completeness.message,
            unaccountedTraits: completeness.unaccounted,
            traitCriteria: Object.fromEntries(
              completeness.unaccounted.map((t) => [t, TRAIT_INFERENCE_CRITERIA[t]])),
            howToProceed: "Re-submit with a value for each trait the description supports, and the rest listed in unsupportedTraits. Nothing was written.",
            written: false,
          }, null, 2) }],
        };
      }
      const builtTraits = buildTraitsFromAnswers(traits);

      // Big Five, when the caller inferred one from the description.
      //
      // Preferred over the cognitive-trait derivation because it reaches all
      // thirteen axes through published correlations instead of nine through
      // our own bridge — but recorded as its OWN route, not merged into stated
      // Big Five. A model reading prose and five numbers a human supplied are
      // different evidence, and collapsing them would erase the distinction the
      // route ordering exists to express. Rejected rather than degraded when it
      // fails validation: a bad profile silently replacing a working
      // trait-derivation is worse than no profile. (2026-08-01)
      let bigFiveAccepted: Record<string, number> | undefined;
      let bigFiveRejected: string | undefined;
      let bigFiveUnrelated: string[] | undefined;
      if (bigFive) {
        const verdict = validateInferredBigFive(bigFive as Record<string, number>, bigFiveEvidence, description);
        if (verdict.ok) { bigFiveAccepted = bigFive as Record<string, number>; bigFiveUnrelated = verdict.unrelatedQuotes; }
        else bigFiveRejected = verdict.reason;
      }

      // A rewrite must not silently demote a persona's values route.
      //
      // Submitting without bigFive is the honest answer when the description
      // does not support one -- and on an EXISTING persona that already had a
      // Big Five profile, it quietly rewrote the record from `big_five` (or
      // `bigfive_inferred`, thirteen axes) down to `cognitive_traits` (nine
      // axes, four frozen at baseline). Following the instruction correctly
      // made the persona worse, and nothing said so. Nobody would notice until
      // they wondered why four values had gone flat.
      //
      // The existing profile is CARRIED FORWARD rather than dropped, because a
      // downgrade nobody asked for is the worse error -- and it is reported
      // loudly, with the traits it was inferred from now changed underneath it.
      // `discardBigFive: true` is the way to actually mean the downgrade.
      // (2026-08-01)
      let carriedBigFive: { from: string; note: string } | undefined;
      if (!bigFiveAccepted && !discardBigFive) {
        try {
          const { loadCustomPersonas } = await import("../personas.js");
          const prior = loadCustomPersonas()[persona_name] as unknown as Record<string, unknown> | undefined;
          const priorDeriv = prior?.valuesDerivation as Record<string, unknown> | undefined;
          const priorMethod = priorDeriv?.method as string | undefined;
          const priorBigFive = prior?.bigFive as Record<string, number> | undefined;
          if (priorBigFive && (priorMethod === "big_five" || priorMethod === "bigfive_inferred")) {
            bigFiveAccepted = priorBigFive;
            carriedBigFive = {
              from: priorMethod,
              note: `This persona already had a ${priorMethod} profile and this submission supplied none, which would have downgraded it to cognitive_traits — nine of thirteen value axes, with hedonism, power, universalism and the relatedness need frozen at 0.5. The existing profile was kept. It was inferred against the PREVIOUS description and traits, so if the persona has genuinely changed, re-supply bigFive with evidence from the new description. To downgrade on purpose, re-submit with discardBigFive:true.`,
            };
          }
        } catch { /* no prior persona; nothing to carry */ }
      }

      const derivedResult = bigFiveAccepted
        ? deriveValuesFromBigFive(bigFiveAccepted)
        : deriveValuesFromTraits(builtTraits);

      // buildTraitsFromAnswers fills every unsupplied trait from research
      // baselines, so a caller who names 3 traits gets back a complete 26-trait
      // persona with no way to tell which 23 were invented. Report both lists.
      // (2026-07-28)
      const allTraitNames = Object.keys(builtTraits);
      const providedTraits = allTraitNames.filter((k) => k in traits);
      const defaultedTraits = allTraitNames.filter((k) => !(k in traits));
      const unknownTraits = Object.keys(traits).filter((k) => !allTraitNames.includes(k));

      // Register the persona in the runtime so empathy_audit, cognitive_effort, etc. can find it
      const { createCognitivePersona, registerPersonas } = await import("../personas.js");
      const personaObj = createCognitivePersona(
        persona_name,
        description || persona_name,
        builtTraits,
        { ageRange: ageRange || undefined },
      );

      // Attach accessibility traits — either from explicit parameter or inferred from name/description
      let resolvedAccessibilityTraits = accessibilityTraits;
      // Which keywords fired, so an inferred number can be argued with rather
      // than just noticed.
      let inferredFrom: string[] = [];
      if (!resolvedAccessibilityTraits || Object.keys(resolvedAccessibilityTraits).length === 0) {
        // Infer disability traits from persona name and description
        const text = `${persona_name} ${description || ''}`.toLowerCase();
        const hasVision = /vision|blind|magnif|low.?vis|sight|visual.?impair/.test(text);
        const hasMotor = /motor|tremor|parkinson|arthrit|dexterity|mobility/.test(text);
        const hasHearing = /deaf|hearing|hard.?of.?hearing/.test(text);
        const hasElderly = /elderly|senior|65|70|75|80|retired|aging|aged/.test(text);

        // Cognitive conditions are NOT one bucket, and treating them as one
        // produced a wrong number with a confident label. ADHD, dyslexia,
        // autism and intellectual disability all matched a single regex and all
        // came out as processingSpeed 0.4 / attentionSpan 0.3 -- so an ADHD
        // persona whose previous record said processingSpeed 0.9 was rewritten
        // to 0.4 by a keyword. ADHD is an attention-regulation condition; it is
        // not a claim about how fast someone processes information, and plenty
        // of people with ADHD process quickly. Autism is not a speed claim
        // either. Dyslexia slows READING specifically. Only the conditions that
        // genuinely bear on speed set speed. (2026-08-01)
        const hasAdhd = /adhd|add\b|attention deficit|executive function/.test(text);
        const hasDyslexia = /dyslexi/.test(text);
        const hasAutism = /autis|asperger|neurodiver/.test(text);
        const hasSlowProcessing = /intellectual disab|brain fog|processing (speed )?(disorder|difficult|impair)|slow (to )?process|cognitive impair|dementia|traumatic brain/.test(text);
        const hasCognitive = hasAdhd || hasDyslexia || hasAutism || hasSlowProcessing;

        if (hasVision || hasMotor || hasCognitive || hasHearing || hasElderly) {
          // Left undefined where the description supports no claim, so the
          // block below falls back to the persona's own traits rather than to a
          // number this inference invented.
          const speed = hasSlowProcessing ? 0.35
            : hasDyslexia ? 0.6
            : hasElderly ? 0.5
            : undefined;
          const attention = hasAdhd ? 0.3
            : hasAutism ? undefined
            : undefined;
          resolvedAccessibilityTraits = {
            visionLevel: hasVision ? 0.4 : hasElderly ? 0.6 : 1.0,
            contrastSensitivity: hasVision ? 0.3 : hasElderly ? 0.5 : 1.0,
            motorControl: hasMotor ? 0.3 : hasElderly ? 0.6 : 1.0,
            tremor: hasMotor,
            ...(speed !== undefined ? { processingSpeed: speed } : {}),
            ...(attention !== undefined ? { attentionSpan: attention } : {}),
            hearingLevel: hasHearing ? 0.2 : 1.0,
          };
          inferredFrom = [
            hasVision && "vision", hasMotor && "motor", hasHearing && "hearing", hasElderly && "age",
            hasAdhd && "ADHD (attention only — not a processing-speed claim)",
            hasDyslexia && "dyslexia (reading speed)", hasAutism && "autism (no speed or attention claim inferred)",
            hasSlowProcessing && "processing-speed condition",
          ].filter(Boolean) as string[];
        }
      }

      if (resolvedAccessibilityTraits && Object.keys(resolvedAccessibilityTraits).length > 0) {
        (personaObj as any).accessibilityTraits = {
          motorControl: resolvedAccessibilityTraits.motorControl ?? 1.0,
          tremor: resolvedAccessibilityTraits.tremor ?? false,
          reachability: ((resolvedAccessibilityTraits.motorControl as number) ?? 1.0) < 0.5 ? 0.4 : 1.0,
          visionLevel: resolvedAccessibilityTraits.visionLevel ?? 1.0,
          contrastSensitivity: resolvedAccessibilityTraits.contrastSensitivity ?? 1.0,
          colorBlindness: resolvedAccessibilityTraits.colorBlindness,
          processingSpeed: resolvedAccessibilityTraits.processingSpeed ?? builtTraits.comprehension ?? 0.8,
          attentionSpan: resolvedAccessibilityTraits.attentionSpan ?? builtTraits.patience ?? 0.7,
          fatigueSusceptibility: ((resolvedAccessibilityTraits.visionLevel as number) ?? 1.0) < 0.7 || ((resolvedAccessibilityTraits.motorControl as number) ?? 1.0) < 0.7 ? 0.7 : 0.3,
        };
      }

      // The route that produced the values, recorded ON the persona so every
      // reader gets the same answer. bigFive is stored too, so the derivation
      // can be re-run and checked rather than taken on trust.
      (personaObj as unknown as Record<string, unknown>).valuesDerivation = bigFiveAccepted
        ? { method: "bigfive_inferred", squash: "tanh", precision: 3,
            inferredFrom: "description", evidence: bigFiveEvidence ?? [] }
        : { method: "cognitive_traits", squash: "tanh", precision: 3 };
      if (bigFiveAccepted) {
        (personaObj as unknown as Record<string, unknown>).bigFive = bigFiveAccepted;
      }
      (personaObj as unknown as Record<string, unknown>).schwartzValues = derivedResult.values;
      // Kept ON the persona: which traits are baseline-by-declaration rather
      // than by omission. Without it the distinction is lost the moment the
      // response is discarded.
      if (unsupportedTraits?.length) {
        (personaObj as unknown as Record<string, unknown>).unsupportedTraits = unsupportedTraits;
      }

      // The attention pattern createCognitivePersona stamps from its template is
      // NOT a declaration.
      //
      // A recreate flipped a stored persona from "thorough" to "skim" while still
      // reporting attentionPatternSource: "declared" -- nobody declared either
      // value. The template's default arrived through humanBehavior, which is
      // exactly where a real declaration lives, so the profile could not tell
      // them apart. Dropping it lets the derivation run and report itself as
      // derived; a caller who wants a declaration sets it through
      // persona_update, which is the surface that takes one. (2026-08-01)
      const hb = (personaObj as unknown as Record<string, unknown>).humanBehavior as
        Record<string, Record<string, unknown>> | undefined;
      if (hb?.attention && "pattern" in hb.attention) delete hb.attention.pattern;

      registerPersonas([personaObj]);

      // Persist to disk. registerPersonas writes to an in-memory map that dies
      // with the process, so a creation whose CMS write also failed left the
      // persona existing NOWHERE -- while the response said registered: true.
      // "Registered" described RAM and read as "saved". (2026-08-01)
      let savedToFile: string | undefined;
      let fileSaveError: string | undefined;
      try {
        const { saveCustomPersona } = await import("../personas.js");
        savedToFile = saveCustomPersona(personaObj as never);
      } catch (e) {
        fileSaveError = (e as Error)?.message ?? String(e);
      }

      // Also save to CMS if an API key is configured (makes it persistent across sessions)
      let savedToCms = false;
      let cmsError: string | undefined;
      try {
        const { getSessionApiKey } = await import("./base/cognitive-tools.js");
        const apiKey = getSessionApiKey();
        if (apiKey) {
          const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
          const slug = persona_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const res = await fetch(`${cmsUrl}/api/personas`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              name: persona_name,
              slug,
              description: description || persona_name,
              traits: builtTraits,
              schwartz_values: derivedResult.values,
              accessibility_traits: resolvedAccessibilityTraits || null,
              age_range: ageRange || personaObj.demographics?.age_range || null,
              source: "mcp",
              // Sent so the row is not re-labelled by guesswork later. A stored
              // block with no provenance reads as `stated`, which would claim a
              // human wrote numbers this route inferred.
              values_derivation: bigFiveAccepted
                ? { method: "bigfive_inferred", squash: "tanh", precision: 3,
                    inferredFrom: "description", evidence: bigFiveEvidence ?? [] }
                : { method: "cognitive_traits", squash: "tanh", precision: 3 },
            }),
          });
          if (res.ok) {
            savedToCms = true;
            console.log(`[persona] Saved "${persona_name}" to CMS`);
          } else {
            const errBody = await res.text().catch(() => "");
            // The REASON travels to the caller. "savedToCms: false" alone does
            // not distinguish an unreachable CMS from a credential the CMS
            // will never accept -- and the second is the actual situation on
            // an OAuth connector, where the bearer forwarded here is an OAuth
            // token and /api/personas only accepts cbk_ account keys. Those
            // need different responses from whoever reads this.
            cmsError = res.status === 401 || res.status === 403
              ? `CMS rejected the credential (${res.status}). The session bearer is forwarded as-is, so an OAuth connector token reaches an endpoint that only accepts cbk_ account keys. Set an account key with set_api_key to make CMS writes succeed.`
              : `CMS returned ${res.status}: ${errBody.slice(0, 120)}`;
            console.warn(`[persona] CMS save failed (${res.status}): ${errBody.slice(0, 100)}`);
          }
        } else {
          cmsError = "no API key in this session — nothing was sent to the CMS";
          console.warn(`[persona] No API key in session — cannot save to CMS`);
        }
      } catch (e) {
        console.warn(`[persona] CMS save error: ${(e as Error).message}`);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            // success is computed below from what actually persisted.
            persona_name,
            description,
            traits: builtTraits,
            providedTraits,
            defaultedTraits,
            // The old line was `${n} of ${n} supplied; 0 filled from research
            // baselines`, and it read as a quality signal no matter how the
            // numbers were arrived at -- a caller who invented six of them got
            // the same clean sentence as one who read all 26 out of the text.
            // The count measures ACCOUNTING. Whether the description supports a
            // value is a different question, and the sentence has to stop
            // answering it by implication.
            traitCompleteness: (() => {
              const base = `${providedTraits.length} of ${allTraitNames.length} supplied; ${defaultedTraits.length} filled from research baselines`;
              const a = completeness.asserted?.length ?? 0;
              const u = completeness.unlabelled?.length ?? 0;
              if (a || u) {
                const parts = [
                  a ? `${a} asserted by the caller rather than read from the description` : "",
                  u ? `${u} with no provenance stated` : "",
                ].filter(Boolean);
                return `${base}. ${parts.join("; ")}. This counts accounting, not support — a supplied value can still be an invention.`;
              }
              return `${base}; all supplied values marked as supported by the description`;
            })(),
            ...(completeness.asserted?.length ? { assertedTraits: completeness.asserted } : {}),
            ...(completeness.unlabelled?.length ? {
              unlabelledTraits: completeness.unlabelled,
              provenanceNote: "These were supplied with no traitProvenance entry, so whether the description supports them is unknown — not assumed. Pass traitProvenance to say which values you read out of the text and which you decided.",
            } : {}),
            ...(carriedBigFive ? { bigFiveCarriedForward: carriedBigFive } : {}),
            ...(bigFiveUnrelated?.length ? {
              bigFiveQuotesUnrelated: bigFiveUnrelated,
              bigFiveQuoteNote: "These quotes are in the description but contain no word bearing on the factor they were cited for. The profile was accepted — the check is a heuristic — but a quote that is not about the factor is not evidence for it.",
            } : {}),
            // A misspelled trait name was previously accepted in silence and had
            // no effect, since buildTraitsFromAnswers only applies keys already
            // present in the trait table.
            ...(unknownTraits.length > 0 ? {
              unknownTraits,
              warning: `Ignored ${unknownTraits.length} unrecognized trait name(s): ${unknownTraits.join(", ")}. These had no effect.`,
            } : {}),
            values: derivedResult.values,
            // The two routes report their working differently -- the trait
            // derivation lists `derivations`, the Big Five one `contributions`.
            // Both are surfaced under their own name so a caller can tell which
            // route ran from the response alone, without inferring it from
            // which key happens to be present.
            ...("derivations" in derivedResult
              ? { derivations: (derivedResult as { derivations: unknown }).derivations }
              : {}),
            ...("contributions" in derivedResult
              ? { bigFiveContributions: (derivedResult as { contributions: unknown }).contributions,
                  hypothesisAxes: (derivedResult as { hypothesisAxes: string[] }).hypothesisAxes }
              : {}),
            valuesRoute: bigFiveAccepted ? "bigfive_inferred" : "cognitive_traits",
            traitSummary: summariseTraits(builtTraits as unknown as Record<string, number>),
            // Named at creation, which is the only moment the distinction is
            // free: a declared-unsupported trait sits at a population baseline
            // and is indistinguishable from a considered value in every later
            // view of this persona.
            ...(unsupportedTraits?.length ? {
              unsupportedTraits,
              unsupportedDetail: unsupportedTraits.map((t) => ({
                trait: t, value: (builtTraits as unknown as Record<string, number>)[t],
                source: "population baseline — the description did not speak to this",
              })),
            } : {}),
            ...(bigFiveAccepted ? { bigFive: bigFiveAccepted, bigFiveEvidence: bigFiveEvidence ?? [] } : {}),
            // A rejected profile is REPORTED, never swallowed. Silently falling
            // back would leave the caller believing the Big Five route ran.
            ...(bigFiveRejected ? {
              bigFiveRejected,
              bigFiveRejectedNote: "The inferred profile was not stored and values were derived from cognitive traits instead, which cannot reach hedonism, power, universalism or the relatedness need. Fix the profile and resubmit to reach all thirteen.",
            } : {}),
            accessibilityTraits: resolvedAccessibilityTraits || null,
            // Presence of the block is not impairment. A persona with vision,
            // motor and hearing all at 1.0 has accessibility traits and no
            // disability, and flagging it flipped an instruction claiming the
            // perceptual layer "will simulate sensory impairment" -- a false
            // statement about what the run does. ADHD is cognitive; supplying
            // ceiling sensory values must not read as a sensory disability.
            hasDisabilityModeling: (() => {
              const a = resolvedAccessibilityTraits as Record<string, unknown> | undefined;
              if (!a) return false;
              const below = (k: string, t = 0.95) =>
                typeof a[k] === "number" && (a[k] as number) < t;
              return below("visionLevel") || below("motorControl") || below("hearingLevel")
                || below("contrastSensitivity") || below("processingSpeed", 0.6)
                || below("attentionSpan", 0.6) || a.tremor === true || !!a.colorBlindness;
            })(),
            disabilityTraitsSource: accessibilityTraits ? 'explicit' : resolvedAccessibilityTraits ? 'inferred_from_description' : 'none',
            ...(inferredFrom.length ? {
              disabilityInferredFrom: inferredFrom,
              disabilityInferenceNote: "Keyword inference, not a diagnosis. It sets a trait only where the condition bears on it — a condition named in the description does not license a number for every accessibility trait. Pass accessibilityTraits explicitly to override any of it.",
            } : {}),
            ageRange: ageRange || personaObj.demographics?.age_range || null,
            registered: true,
            // Both stores named, and whether the persona SURVIVES stated
            // outright. savedToCms alone read as a minor caveat when combined
            // with registered:true it meant the persona was in RAM and nowhere
            // else.
            savedToCms,
            savedToFile: savedToFile ? true : false,
            ...(savedToFile ? { filePath: savedToFile } : {}),
            ...(fileSaveError ? { fileSaveError } : {}),
            // Agentic callers branch on success. A partial write that reports
            // success is a write nobody retries, which is how the two stores
            // drift apart in the first place -- so a half-completed write is
            // reported as a failure with the half that landed named, rather
            // than as a success with a caveat.
            success: !!savedToFile && savedToCms,
            ...(savedToFile && !savedToCms ? { partialWrite: true } : {}),
            writeStatus: { fileStore: savedToFile ? "ok" : "failed", cms: savedToCms ? "ok" : "failed" },
            ...(cmsError ? { cmsError } : {}),
            persisted: !!savedToFile || savedToCms,
            persistenceNote: savedToFile && savedToCms
              ? "Written to the file store and the CMS."
              : savedToFile
                ? "Written to the file store. The CMS copy was NOT written, so the two stores disagree — the persona survives restarts but will not appear for other clients of the CMS."
                : savedToCms
                  ? "Written to the CMS only. The file store did NOT take it, so tools reading the file store will not find this persona."
                  : "NOT PERSISTED. The persona exists only in this server process's memory and will be gone when it restarts. `registered: true` above means RAM, not storage.",
            instruction: resolvedAccessibilityTraits
              // Names the modalities actually impaired instead of claiming
              // "sensory impairment" wholesale. An ADHD persona with vision,
              // motor and hearing at 1.0 and a short attention span has
              // something real to model -- but nothing SENSORY, and the old
              // text promised a simulation that would not happen. A claim about
              // what a run will do has to match what the numbers support.
              ? (() => {
                  const a = resolvedAccessibilityTraits as Record<string, unknown>;
                  const impaired: string[] = [];
                  const lo = (k: string, label: string, t = 0.95) => {
                    if (typeof a[k] === "number" && (a[k] as number) < t) impaired.push(`${label} ${a[k]}`);
                  };
                  lo("visionLevel", "vision"); lo("contrastSensitivity", "contrast");
                  lo("motorControl", "motor"); lo("hearingLevel", "hearing");
                  lo("processingSpeed", "processing speed", 0.6);
                  lo("attentionSpan", "attention span", 0.6);
                  if (a.tremor === true) impaired.push("tremor");
                  if (a.colorBlindness) impaired.push(`colour vision (${String(a.colorBlindness)})`);
                  const sensory = impaired.some((x) => /^(vision|contrast|hearing|colour)/.test(x));
                  return `Persona "${persona_name}" created with accessibility modeling on: ${impaired.join(", ")}. `
                    + (sensory
                        ? "The perceptual transport layer will simulate the sensory limits above. "
                        : "No SENSORY channel is impaired, so perception is simulated as intact; the limits above are cognitive and motor. ")
                    + "Use with empathy_audit for disability scoring.`".slice(0, -1);
                })()
              : `Persona "${persona_name}" created with cognitive-only modeling. For disability-specific scoring (vision impairment, motor difficulty, etc.), recreate with accessibilityTraits parameter.`,
            usage_example: {
              tool: "empathy_audit",
              params: {
                disabilities: [persona_name],
              },
            },
          }, null, 2),
        }],
      };
    }
  );

  server.registerTool("persona_create_cancel", {
    title: "Cancel Persona Creation",
    description: "Cancel the current persona creation questionnaire session.",
    inputSchema: {},
    annotations: {
      title: "Cancel Persona Creation",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async () => {
      const sessionId = getSessionId();
      const session = getQuestionnaireSession(sessionId);

      if (!session) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              message: "No questionnaire session to cancel",
            }, null, 2),
          }],
        };
      }

      const personaName = session.personaName;
      const progress = session.currentIndex;
      clearQuestionnaireSession(sessionId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            cancelled: true,
            persona_name: personaName,
            progress_lost: `${progress} questions answered`,
            instruction: "Questionnaire cancelled. Use persona_create_start to begin a new persona.",
          }, null, 2),
        }],
      };
    }
  );

  server.registerTool("persona_traits_list", {
    title: "List Persona Traits",
    description: "List all available cognitive traits with descriptions. Useful for understanding what traits can be customized.",
    inputSchema: {},
    annotations: {
      title: "List Persona Traits",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async () => {
      const traits = TRAIT_REFERENCE_MATRIX.map(trait => ({
        name: trait.name,
        description: trait.description,
        researchBasis: trait.researchBasis,
        levels: trait.levels.map(l => ({
          value: l.value,
          label: l.label,
        })),
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            count: traits.length,
            traits,
            usage: "Use these traits with persona_create_submit_traits or customize them in cognitive_journey_init",
          }, null, 2),
        }],
      };
    }
  );
}
