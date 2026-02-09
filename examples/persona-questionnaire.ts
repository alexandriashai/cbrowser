/**
 * Persona Questionnaire Example
 *
 * This example demonstrates the research-backed persona questionnaire system
 * introduced in v16.6.0. The questionnaire maps behavioral answers to cognitive
 * trait values (0-1 scale) with proper correlation adjustments.
 *
 * The questionnaire works across:
 * - Claude sessions (via AskUserQuestion tool)
 * - CLI (interactive terminal prompts)
 * - Remote and Local MCP servers
 */

import {
  generatePersonaQuestionnaire,
  buildTraitsFromAnswers,
  getTraitBehaviors,
  getTraitLabel,
  getTraitReference,
  formatForAskUserQuestion,
  TRAIT_REFERENCE_MATRIX,
} from 'cbrowser';

// Example 1: Generate the questionnaire for Claude's AskUserQuestion tool
function claudeQuestionnaireExample() {
  console.log('\n=== Claude AskUserQuestion Format ===\n');

  // Generate a quick 8-trait questionnaire
  const questionnaire = generatePersonaQuestionnaire({ comprehensive: false });

  console.log(`Generated ${questionnaire.questions.length} questions:`);

  for (const q of questionnaire.questions) {
    console.log(`\nTrait: ${q.trait}`);
    console.log(`Question: ${q.question}`);
    console.log('Options:');
    for (const opt of q.options) {
      console.log(`  [${opt.value}] ${opt.label}`);
    }
  }

  // Format for AskUserQuestion tool
  const askUserFormat = formatForAskUserQuestion(questionnaire.questions.slice(0, 4));
  console.log('\n=== AskUserQuestion Format (first 4 questions) ===');
  console.log(JSON.stringify(askUserFormat, null, 2));
}

// Example 2: Build traits from questionnaire answers
function buildTraitsExample() {
  console.log('\n=== Building Traits from Answers ===\n');

  // Simulate answers from questionnaire
  const answers: Record<string, number> = {
    patience: 0.25,           // Gets frustrated quickly
    riskTolerance: 0.75,      // Willing to try new things
    comprehension: 0.5,       // Average
    persistence: 0.75,        // Keeps trying
    curiosity: 1.0,           // Very curious, explores everything
    workingMemory: 0.5,       // Average
    readingTendency: 0.25,    // Skims, doesn't read carefully
    resilience: 0.5,          // Average bounce-back
  };

  // Build full trait profile with correlations applied
  const traits = buildTraitsFromAnswers(answers);

  console.log('Input answers:', answers);
  console.log('\nDerived trait profile (with correlations):');

  for (const [trait, value] of Object.entries(traits)) {
    const label = getTraitLabel(trait, value);
    console.log(`  ${trait}: ${value.toFixed(2)} (${label})`);
  }
}

// Example 3: Lookup trait behaviors
function traitBehaviorLookup() {
  console.log('\n=== Trait Behavior Lookup ===\n');

  const trait = 'patience';
  const value = 0.25;

  const behaviors = getTraitBehaviors(trait, value);
  const reference = getTraitReference(trait);

  console.log(`Trait: ${trait}`);
  console.log(`Value: ${value}`);
  console.log(`Label: ${behaviors.label}`);
  console.log(`Description: ${behaviors.description}`);
  console.log(`\nBehaviors:`);
  for (const behavior of behaviors.behaviors) {
    console.log(`  - ${behavior}`);
  }
  console.log(`\nResearch basis: ${reference?.researchBasis || 'None'}`);
  console.log(`Citations: ${reference?.citations?.join(', ') || 'None'}`);
}

// Example 4: List all available traits
function listAllTraits() {
  console.log('\n=== All 25 Cognitive Traits ===\n');

  const traits = Object.keys(TRAIT_REFERENCE_MATRIX);

  console.log(`Total traits: ${traits.length}\n`);

  for (const trait of traits) {
    const ref = getTraitReference(trait);
    console.log(`${trait}:`);
    console.log(`  Research: ${ref?.researchBasis || 'General'}`);
    console.log(`  Range: 0 (${getTraitLabel(trait, 0)}) to 1 (${getTraitLabel(trait, 1)})`);
    console.log('');
  }
}

// Example 5: Comprehensive questionnaire (all 25 traits)
function comprehensiveQuestionnaireExample() {
  console.log('\n=== Comprehensive Questionnaire ===\n');

  const questionnaire = generatePersonaQuestionnaire({
    comprehensive: true,
    includeResearch: true,
  });

  console.log(`Comprehensive questionnaire: ${questionnaire.questions.length} questions`);
  console.log(`Estimated time: ${questionnaire.estimatedMinutes} minutes\n`);

  // Show first 3 questions with research citations
  for (const q of questionnaire.questions.slice(0, 3)) {
    console.log(`[${q.trait}] ${q.question}`);
    if (q.researchBasis) {
      console.log(`  Research: ${q.researchBasis}`);
    }
    console.log('');
  }
}

// Example 6: Custom trait selection
function customTraitSelection() {
  console.log('\n=== Custom Trait Selection ===\n');

  // Only get questions for specific traits
  const questionnaire = generatePersonaQuestionnaire({
    traits: ['patience', 'riskTolerance', 'selfEfficacy', 'trustCalibration'],
  });

  console.log(`Custom questionnaire: ${questionnaire.questions.length} questions\n`);

  for (const q of questionnaire.questions) {
    console.log(`${q.trait}: ${q.question}`);
  }
}

// Example 7: Trait correlation demonstration
function correlationExample() {
  console.log('\n=== Trait Correlations ===\n');

  // Low self-efficacy should correlate with higher internal attribution
  const lowEfficacyAnswers: Record<string, number> = {
    selfEfficacy: 0.25, // "I probably can't figure this out"
  };

  const derived = buildTraitsFromAnswers(lowEfficacyAnswers);

  console.log('Input: selfEfficacy = 0.25 (Low)');
  console.log('\nCorrelated traits automatically adjusted:');
  console.log(`  internalAttribution: ${derived.internalAttribution?.toFixed(2)} (blames self for failures)`);
  console.log(`  resilience: ${derived.resilience?.toFixed(2)} (lower bounce-back ability)`);
  console.log('\nResearch: Bandura (1977) - Self-efficacy affects attribution patterns');
}

// Example 8: Integration with cognitive journey
async function journeyIntegrationExample() {
  console.log('\n=== Integration with Cognitive Journey ===\n');

  // Build traits from questionnaire answers
  const answers: Record<string, number> = {
    patience: 0.25,
    riskTolerance: 0.5,
    comprehension: 0.75,
    selfEfficacy: 0.5,
    curiosity: 0.75,
  };

  const traits = buildTraitsFromAnswers(answers);

  console.log('Generated trait profile for cognitive journey:');
  console.log(JSON.stringify(traits, null, 2));

  console.log('\nUse with runCognitiveJourney:');
  console.log(`
const result = await runCognitiveJourney({
  persona: 'custom',
  startUrl: 'https://example.com',
  goal: 'complete signup',
  customTraits: ${JSON.stringify(traits, null, 2)},
});
`);
}

// Run examples
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  CBrowser Persona Questionnaire Examples (v16.6.0)             ║');
  console.log('║  Research-backed trait mapping for cognitive user simulation  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  claudeQuestionnaireExample();
  buildTraitsExample();
  traitBehaviorLookup();
  // listAllTraits();              // Uncomment for full trait list
  comprehensiveQuestionnaireExample();
  customTraitSelection();
  correlationExample();
  await journeyIntegrationExample();

  console.log('\n=== Example Complete ===');
}

main().catch(console.error);
