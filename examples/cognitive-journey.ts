/**
 * Cognitive User Simulation Example
 *
 * This example demonstrates how to run autonomous, goal-driven user simulations
 * where the AI acts as a realistic persona with cognitive traits and abandonment detection.
 *
 * Cognitive journeys go beyond timing and click patterns—they model how users actually
 * think, including frustration, confusion, patience depletion, and genuine abandonment.
 */

import { runCognitiveJourney, setAnthropicApiKey, isApiKeyConfigured } from 'cbrowser';

// Ensure API key is configured
if (!isApiKeyConfigured()) {
  console.log('API key not configured. Run: npx cbrowser config set-api-key');
  process.exit(1);
}

// Example 1: Basic cognitive journey
async function basicJourney() {
  console.log('\n=== Basic Cognitive Journey ===\n');

  const result = await runCognitiveJourney({
    persona: 'first-timer',
    startUrl: 'https://example.com',
    goal: 'sign up for an account',
    verbose: true,
  });

  console.log('Goal achieved:', result.goalAchieved);
  console.log('Steps taken:', result.steps.length);

  if (!result.goalAchieved && result.abandonmentReason) {
    console.log('User gave up:', result.abandonmentReason);
    console.log('Final thought:', result.finalThought);
  }

  // Show friction points
  if (result.frictionPoints.length > 0) {
    console.log('\nFriction points detected:');
    for (const fp of result.frictionPoints) {
      console.log(`  - ${fp.type}: ${fp.monologue}`);
    }
  }
}

// Example 2: Journey with custom traits
async function customTraitsJourney() {
  console.log('\n=== Journey with Custom Traits ===\n');

  const result = await runCognitiveJourney({
    persona: 'elderly-user',
    startUrl: 'https://example.com',
    goal: 'find the help page',
    customTraits: {
      patience: 0.3,        // Very patient
      riskTolerance: 0.2,   // Cautious about clicking unfamiliar things
      comprehension: 0.4,   // Struggles with UI conventions
      readingTendency: 0.9, // Reads everything carefully
    },
    maxSteps: 30,
    verbose: true,
  });

  console.log('Journey completed');
  console.log('Average confusion level:',
    result.steps.reduce((sum, s) => sum + s.stateAfter.confusionLevel, 0) / result.steps.length
  );
}

// Example 3: Journey with step callbacks
async function journeyWithCallbacks() {
  console.log('\n=== Journey with Step Callbacks ===\n');

  const result = await runCognitiveJourney({
    persona: 'impatient-user',
    startUrl: 'https://example.com',
    goal: 'complete checkout',
    onStep: (step) => {
      console.log(`Step ${step.stepNumber}: ${step.action}`);
      console.log(`  Reasoning: ${step.reasoning}`);
      console.log(`  Patience: ${(step.stateAfter.patienceRemaining * 100).toFixed(0)}%`);
      console.log(`  Confusion: ${(step.stateAfter.confusionLevel * 100).toFixed(0)}%`);

      if (step.stateAfter.patienceRemaining < 0.3) {
        console.log('  ⚠️ User patience running low!');
      }
    },
  });

  console.log('\nJourney finished');
}

// Example 4: Decision Fatigue Metrics (v9.9.0)
async function decisionFatigueExample() {
  console.log('\n=== Decision Fatigue Metrics (v9.9.0) ===\n');

  const result = await runCognitiveJourney({
    persona: 'first-timer',
    startUrl: 'https://example.com/signup',
    goal: 'complete registration with all options',
    verbose: true,
  });

  // v9.9.0 decision fatigue metrics
  console.log('Decision Fatigue Analysis:');
  console.log(`  Decisions made: ${result.summary.decisionsMade}`);
  console.log(`  Final fatigue: ${(result.summary.finalDecisionFatigue * 100).toFixed(0)}%`);

  if (result.summary.wasChoosingDefaults) {
    console.log('  ⚠️ User started choosing defaults due to fatigue');
    console.log('  Recommendation: Reduce number of choices or use smart defaults');
  }
}

// Example 5: Dual-Process Theory (v10.0.0)
async function dualProcessExample() {
  console.log('\n=== Dual-Process Theory (v10.0.0) ===\n');

  // Power users start in System 1 (automatic, fast)
  // They switch to System 2 (deliberate) when confused
  const result = await runCognitiveJourney({
    persona: 'power-user',
    startUrl: 'https://example.com/settings',
    goal: 'configure advanced notification preferences',
    verbose: true,
  });

  if (result.cognitiveMode) {
    console.log('Cognitive Mode Analysis:');
    console.log(`  Started in: System ${result.cognitiveMode.system === 1 ? '1 (Automatic)' : '2 (Deliberate)'}`);
    console.log(`  Time in System 1: ${result.cognitiveMode.timeInSystem1}ms`);
    console.log(`  Time in System 2: ${result.cognitiveMode.timeInSystem2}ms`);
    console.log(`  System 1 errors: ${result.cognitiveMode.system1Errors}`);

    const pctSystem1 = (result.cognitiveMode.timeInSystem1 /
      (result.cognitiveMode.timeInSystem1 + result.cognitiveMode.timeInSystem2) * 100).toFixed(0);
    console.log(`  Efficiency: ${pctSystem1}% automatic thinking`);
  }
}

// Example 6: Fitts' Law Motor Timing (v9.9.0)
async function fittsLawExample() {
  console.log('\n=== Fitts\' Law Motor Timing (v9.9.0) ===\n');

  // Elderly users have age modifier affecting mouse movement
  const result = await runCognitiveJourney({
    persona: 'elderly-user',
    startUrl: 'https://example.com',
    goal: 'click the small help icon in the corner',
    verbose: true,
  });

  // Find steps with click actions to see Fitts' Law in action
  const clickSteps = result.steps.filter(s => s.action?.startsWith('click'));
  for (const step of clickSteps) {
    console.log(`Step ${step.stepNumber}: ${step.action}`);
    if (step.mouseMovementTime) {
      console.log(`  Mouse movement time: ${step.mouseMovementTime}ms`);
      console.log(`  (Includes age modifier for elderly persona)`);
    }
  }
}

// Example 7: Compare cognitive traits across personas
async function comparePersonas() {
  console.log('\n=== Comparing Personas ===\n');

  const personas = ['power-user', 'first-timer', 'elderly-user', 'impatient-user'];
  const results = [];

  for (const persona of personas) {
    console.log(`Running journey as ${persona}...`);

    const result = await runCognitiveJourney({
      persona,
      startUrl: 'https://example.com',
      goal: 'find pricing information',
      maxSteps: 20,
    });

    results.push({
      persona,
      goalAchieved: result.goalAchieved,
      steps: result.steps.length,
      abandonmentReason: result.abandonmentReason,
      frictionPoints: result.frictionPoints.length,
    });
  }

  console.log('\n=== Comparison Results ===\n');
  console.log('Persona         | Success | Steps | Friction | Abandonment Reason');
  console.log('----------------+---------+-------+----------+-------------------');

  for (const r of results) {
    console.log(
      `${r.persona.padEnd(15)} | ${r.goalAchieved ? 'pass   ' : 'fail   '} | ${
        String(r.steps).padStart(5)
      } | ${String(r.frictionPoints).padStart(8)} | ${r.abandonmentReason || '-'}`
    );
  }
}

// Run examples
async function main() {
  try {
    await basicJourney();
    // await customTraitsJourney();
    // await journeyWithCallbacks();
    // await decisionFatigueExample();  // v9.9.0
    // await dualProcessExample();       // v10.0.0
    // await fittsLawExample();          // v9.9.0
    // await comparePersonas();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
