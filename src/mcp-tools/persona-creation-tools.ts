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
  deriveValuesFromTraits,
  TRAIT_REFERENCE_MATRIX,
} from "../persona-questionnaire.js";
import type { CognitiveTraits } from "../types.js";

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
    mentalModelRigidity: "Flexibility",
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
  server.tool(
    "persona_create_start",
    "Start creating a custom persona. YOU MUST USE YOUR AskUserQuestion TOOL to present the choice to the user - do NOT just show JSON. Ask whether they want questionnaire or description mode.",
    {
      persona_name: z.string().describe("Name for the new persona (e.g., 'tech-savvy-millennial')"),
      comprehensive: z.boolean().optional().describe("Include all 25 traits (true) or just core 8 traits (false, default)"),
    },
    async ({ persona_name, comprehensive = false }) => {
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

  server.tool(
    "persona_create_questionnaire_start",
    "Start the questionnaire mode for persona creation. YOU MUST USE AskUserQuestion to present each question interactively.",
    {
      persona_name: z.string().describe("Name for the new persona"),
      comprehensive: z.boolean().optional().describe("Include all 25 traits (default: false, core 8 traits only)"),
    },
    async ({ persona_name, comprehensive = false }) => {
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

Header: "${getTraitHeader(firstQuestion.trait)}"

Options:
${firstQuestion.options.map((o, i) => `${i + 1}. "${o.label}" - ${o.description}`).join("\n")}

After the user selects an option, call persona_create_questionnaire_answer with answer_value set to the option's value.

IMPORTANT: Use AskUserQuestion - do NOT just display this text.`,
        }],
      };
    }
  );

  server.tool(
    "persona_create_questionnaire_answer",
    "Submit an answer for the current questionnaire question. Returns instructions for the next question, or completed persona when done.",
    {
      answer_value: z.number().min(0).max(1).describe("The value selected (0.0, 0.25, 0.33, 0.67, 0.75, or 1.0)"),
    },
    async ({ answer_value }) => {
      const sessionId = getSessionId();
      const session = getQuestionnaireSession(sessionId);

      if (!session) {
        return {
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
        session.answers[currentQuestion.trait] = answer_value;
        session.answerMetadata[currentQuestion.trait] = {
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

Header: "${getTraitHeader(nextQuestion.trait)}"

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

  server.tool(
    "persona_create_from_description",
    "Create a persona from a text description. Returns trait reference matrix for Claude to infer appropriate values.",
    {
      persona_name: z.string().describe("Name for the new persona"),
      description: z.string().describe("Text description of the persona (e.g., 'An impatient power user who skims content')"),
    },
    async ({ persona_name, description }) => {
      const traitInfo = TRAIT_REFERENCE_MATRIX.map(trait => ({
        name: trait.name,
        description: trait.description,
        levels: trait.levels.map(l => ({
          value: l.value,
          label: l.label,
          behaviors: l.behaviors.slice(0, 2),
        })),
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            mode: "manual_inference",
            persona_name,
            user_description: description,
            instruction: `Based on the user's description, infer appropriate trait values (0.0 to 1.0) for each cognitive trait. Use the trait reference matrix below to guide your inference. Return the traits via persona_create_submit_traits.`,
            trait_reference: traitInfo,
            example_output: {
              patience: 0.25,
              riskTolerance: 0.75,
              comprehension: 0.75,
              persistence: 0.5,
              curiosity: 0.5,
              workingMemory: 0.75,
              readingTendency: 0.25,
            },
            follow_up_tool: "persona_create_submit_traits",
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "persona_create_submit_traits",
    "Submit inferred traits for a persona created from description. Use after persona_create_from_description.",
    {
      persona_name: z.string().describe("Name for the persona"),
      traits: z.record(z.string(), z.number()).describe("Map of trait names to values (0-1)"),
      description: z.string().optional().describe("Original description for reference"),
    },
    async ({ persona_name, traits, description }) => {
      const builtTraits = buildTraitsFromAnswers(traits);
      const derivedResult = deriveValuesFromTraits(builtTraits);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            persona_name,
            description,
            traits: builtTraits,
            values: derivedResult.values,
            derivations: derivedResult.derivations,
            instruction: `Persona "${persona_name}" created. Use with cognitive_journey_init.`,
            usage_example: {
              tool: "cognitive_journey_init",
              params: {
                persona: persona_name,
                customTraits: builtTraits,
              },
            },
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "persona_create_cancel",
    "Cancel the current persona creation questionnaire session.",
    {},
    async () => {
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

  server.tool(
    "persona_traits_list",
    "List all available cognitive traits with descriptions. Useful for understanding what traits can be customized.",
    {},
    async () => {
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
