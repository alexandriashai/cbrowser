/**
 * Persona management and the persona questionnaire: persona,
 * persona-questionnaire.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { BUILTIN_PERSONAS, loadCustomPersonas, isBuiltinPersona, generatePersonaFromDescription, saveCustomPersona, deleteCustomPersona } from "../../personas.js";
import { readlineQuestion } from "../options.js";
import type { CommandContext } from "../context.js";

/** Runs `command` when it belongs to this group; false when it does not. */
export async function runPersonaCommand(ctx: CommandContext): Promise<boolean> {
  const { command, args, options } = ctx;
  switch (command) {
    case "persona": {
      const subcommand = args[0];

      switch (subcommand) {
        case "list": {
          console.log("\n📋 Available Personas:\n");

          // Built-in personas
          console.log("  Built-in:");
          for (const [name, persona] of Object.entries(BUILTIN_PERSONAS)) {
            console.log(`    ${name}`);
            console.log(`      ${persona.description}`);
            console.log(`      Tech: ${persona.demographics?.tech_level ?? "unknown"} | Device: ${persona.demographics?.device ?? "unknown"}`);
            console.log("");
          }

          // Custom personas
          const customPersonas = loadCustomPersonas();
          const customNames = Object.keys(customPersonas);
          if (customNames.length > 0) {
            console.log("  Custom:");
            for (const [name, persona] of Object.entries(customPersonas)) {
              console.log(`    ${name}`);
              console.log(`      ${persona.description}`);
              console.log(`      Tech: ${persona.demographics?.tech_level ?? "unknown"} | Device: ${persona.demographics?.device ?? "unknown"}`);
              console.log("");
            }
          }
          break;
        }

        case "create": {
          const description = args.slice(1).join(" ");
          if (!description) {
            console.error("Usage: cbrowser persona create \"<description>\" [--name <name>]");
            console.error("\nExamples:");
            console.error("  cbrowser persona create \"impatient developer who hates slow UIs\"");
            console.error("  cbrowser persona create \"elderly user new to computers\" --name grandma");
            console.error("  cbrowser persona create \"distracted teen on their phone\"");
            process.exit(1);
          }

          // Generate name from description if not provided
          let personaName = options.name as string;
          if (!personaName) {
            // Create a slug from first few words
            personaName = description
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, "")
              .split(/\s+/)
              .slice(0, 3)
              .join("-");
          }

          // Check if trying to overwrite built-in
          if (isBuiltinPersona(personaName)) {
            console.error(`Error: Cannot overwrite built-in persona "${personaName}"`);
            console.error("Use a different name with --name <name>");
            process.exit(1);
          }

          console.log(`\n🤖 Generating persona from description...\n`);
          console.log(`   "${description}"\n`);

          const persona = generatePersonaFromDescription(personaName, description);

          // Display the generated persona
          console.log(`━━━ Generated Persona: ${persona.name} ━━━\n`);
          console.log(`Description: ${persona.description}`);
          console.log(`\nDemographics:`);
          console.log(`  Age Range: ${persona.demographics?.age_range ?? "unknown"}`);
          console.log(`  Tech Level: ${persona.demographics?.tech_level ?? "unknown"}`);
          console.log(`  Device: ${persona.demographics?.device ?? "unknown"}`);

          console.log(`\nTiming:`);
          console.log(`  Reaction Time: ${persona.humanBehavior?.timing.reactionTime.min}-${persona.humanBehavior?.timing.reactionTime.max}ms`);
          console.log(`  Click Delay: ${persona.humanBehavior?.timing.clickDelay.min}-${persona.humanBehavior?.timing.clickDelay.max}ms`);
          console.log(`  Type Speed: ${persona.humanBehavior?.timing.typeSpeed.min}-${persona.humanBehavior?.timing.typeSpeed.max}ms/char`);
          console.log(`  Reading Speed: ${persona.humanBehavior?.timing.readingSpeed} wpm`);

          console.log(`\nError Rates:`);
          console.log(`  Misclick: ${((persona.humanBehavior?.errors.misClickRate || 0) * 100).toFixed(0)}%`);
          console.log(`  Accidental Double-click: ${((persona.humanBehavior?.errors.doubleClickAccidental || 0) * 100).toFixed(0)}%`);
          console.log(`  Typo: ${((persona.humanBehavior?.errors.typoRate || 0) * 100).toFixed(0)}%`);

          console.log(`\nMouse Behavior:`);
          console.log(`  Speed: ${persona.humanBehavior?.mouse.speed}`);
          console.log(`  Curvature: ${persona.humanBehavior?.mouse.curvature}`);
          console.log(`  Jitter: ${persona.humanBehavior?.mouse.jitter}px`);

          console.log(`\nAttention:`);
          console.log(`  Pattern: ${persona.humanBehavior?.attention.pattern}`);
          console.log(`  Scroll: ${persona.humanBehavior?.attention.scrollBehavior}`);
          console.log(`  Focus: ${persona.humanBehavior?.attention.focusAreas.join(", ")}`);
          console.log(`  Distraction Rate: ${((persona.humanBehavior?.attention.distractionRate || 0) * 100).toFixed(0)}%`);

          console.log(`\nViewport: ${persona.context?.viewport?.[0]}x${persona.context?.viewport?.[1]}`);

          if (Object.keys(persona.behaviors).length > 0) {
            console.log(`\nBehaviors: ${Object.keys(persona.behaviors).join(", ")}`);
          }

          // Save the persona
          const filepath = saveCustomPersona(persona);
          console.log(`\n✓ Persona saved: ${filepath}`);
          console.log(`\nUse with: cbrowser cognitive-journey --persona ${personaName} --start <url> --goal "<goal>"`);
          break;
        }

        case "show": {
          const name = args[1];
          if (!name) {
            console.error("Usage: cbrowser persona show <name>");
            process.exit(1);
          }

          // Check built-in first, then custom
          let persona = BUILTIN_PERSONAS[name];
          let isCustom = false;

          if (!persona) {
            const customPersonas = loadCustomPersonas();
            persona = customPersonas[name];
            isCustom = true;
          }

          if (!persona) {
            console.error(`Persona not found: ${name}`);
            console.error("Run 'cbrowser persona list' to see available personas");
            process.exit(1);
          }

          console.log(`\n━━━ Persona: ${persona.name} ${isCustom ? "(custom)" : "(built-in)"} ━━━\n`);
          console.log(JSON.stringify(persona, null, 2));
          break;
        }

        case "delete": {
          const name = args[1];
          if (!name) {
            console.error("Usage: cbrowser persona delete <name>");
            process.exit(1);
          }

          if (isBuiltinPersona(name)) {
            console.error(`Cannot delete built-in persona: ${name}`);
            process.exit(1);
          }

          const deleted = deleteCustomPersona(name);
          if (deleted) {
            console.log(`✓ Persona deleted: ${name}`);
          } else {
            console.error(`Custom persona not found: ${name}`);
            process.exit(1);
          }
          break;
        }

        case "export": {
          const name = args[1];
          if (!name) {
            console.error("Usage: cbrowser persona export <name>");
            process.exit(1);
          }

          // Get persona (built-in or custom)
          let persona = BUILTIN_PERSONAS[name];
          if (!persona) {
            const customPersonas = loadCustomPersonas();
            persona = customPersonas[name];
          }

          if (!persona) {
            console.error(`Persona not found: ${name}`);
            process.exit(1);
          }

          const fs = await import("fs");
          const filename = `${name}.persona.json`;
          fs.writeFileSync(filename, JSON.stringify(persona, null, 2));
          console.log(`✓ Exported to: ${filename}`);
          break;
        }

        case "import": {
          const file = args[1];
          if (!file) {
            console.error("Usage: cbrowser persona import <file>");
            process.exit(1);
          }

          const fs = await import("fs");
          if (!fs.existsSync(file)) {
            console.error(`File not found: ${file}`);
            process.exit(1);
          }

          try {
            const content = fs.readFileSync(file, "utf-8");
            const persona = JSON.parse(content);

            if (!persona.name || !persona.description) {
              console.error("Invalid persona file: missing name or description");
              process.exit(1);
            }

            if (isBuiltinPersona(persona.name)) {
              console.error(`Cannot import: "${persona.name}" is a built-in persona name`);
              console.error("Edit the JSON file to change the name");
              process.exit(1);
            }

            const filepath = saveCustomPersona(persona);
            console.log(`✓ Imported persona: ${persona.name}`);
            console.log(`  Saved to: ${filepath}`);
          } catch (e: any) {
            console.error(`Failed to import: ${e.message}`);
            process.exit(1);
          }
          break;
        }

        case "cleanup": {
          // Import the cleanup functions
          const { listInvalidPersonas, cleanupInvalidPersonas } = await import("../../personas.js");

          const dryRun = options["dry-run"] === true;

          if (dryRun) {
            const invalid = listInvalidPersonas();
            if (invalid.length === 0) {
              console.log("✓ No invalid personas found.");
            } else {
              console.log(`\n⚠️  Found ${invalid.length} invalid persona(s):\n`);
              for (const { name, reason } of invalid) {
                console.log(`  • ${name}`);
                console.log(`    Reason: ${reason}`);
              }
              console.log("\nRun 'cbrowser persona cleanup' (without --dry-run) to remove them.");
            }
          } else {
            const removed = cleanupInvalidPersonas();
            if (removed.length === 0) {
              console.log("✓ No invalid personas found.");
            } else {
              console.log(`\n🧹 Removed ${removed.length} invalid persona(s):\n`);
              for (const { name, reason } of removed) {
                console.log(`  ✗ ${name}`);
                console.log(`    Reason: ${reason}`);
              }
            }
          }
          break;
        }

        default:
          console.error("Usage: cbrowser persona [list|create|show|delete|export|import|cleanup]");
          console.error("\nExamples:");
          console.error("  cbrowser persona list");
          console.error("  cbrowser persona create \"impatient developer\" --name dev-persona");
          console.error("  cbrowser persona show power-user");
          console.error("  cbrowser persona delete my-custom-persona");
          console.error("  cbrowser persona cleanup --dry-run    # Preview invalid personas");
          console.error("  cbrowser persona cleanup              # Remove invalid personas");
          process.exit(1);
      }
      break;
    }

    // =========================================================================
    // Persona Questionnaire (v16.5.0) - Research-based custom persona builder
    // =========================================================================

    case "persona-questionnaire": {
      const subcommand = args[0];

      if (!subcommand || subcommand === "help") {
        console.log(`
CBrowser Persona Questionnaire (v16.5.0)
========================================

Build custom personas from a questionnaire that maps behavioral answers
to cognitive trait values. The mapping and the level wording are written
by hand; traits you skip take hand-set defaults.

Commands:
  persona-questionnaire start        Start interactive questionnaire
  persona-questionnaire list-traits  List all available traits with descriptions
  persona-questionnaire lookup       Look up behaviors for a specific trait value

Options for 'start':
  --comprehensive     Include all 30 traits (default: 13 core traits)
  --name <name>       Name for the persona (prompted if not provided)
  --output <file>     Save questionnaire answers to JSON file

Options for 'lookup':
  --trait <name>      Trait name (e.g., patience, riskTolerance)
  --value <0-1>       Trait value to look up

Examples:
  cbrowser persona-questionnaire start
  cbrowser persona-questionnaire start --comprehensive --name "my-tester"
  cbrowser persona-questionnaire list-traits
  cbrowser persona-questionnaire lookup --trait patience --value 0.25
`);
        process.exit(0);
      }

      const { generatePersonaQuestionnaire, buildTraitsFromAnswers, getTraitReference, TRAIT_REFERENCE_MATRIX } = await import("../../persona-questionnaire.js");
      const { createCognitivePersona, saveCustomPersona } = await import("../../personas.js");

      switch (subcommand) {
        case "start": {
          const comprehensive = options.comprehensive === true;
          const questions = generatePersonaQuestionnaire({ comprehensive });

          console.log(`\n🧠 CBrowser Persona Questionnaire`);
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(`This questionnaire sets a custom persona's traits from your answers (a hand-written mapping, not a measurement).`);
          console.log(`Answer each question to define cognitive traits.\n`);

          // Get persona name
          let personaName = options.name as string;
          if (!personaName) {
            console.log(`Enter a name for this persona:`);
            personaName = await readlineQuestion("> ") || "custom-persona";
          }

          console.log(`\nCreating persona: ${personaName}\n`);

          // Collect answers
          const answers: Record<string, number> = {};

          for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            console.log(`\n[${i + 1}/${questions.length}] ${q.question}\n`);

            q.options.forEach((opt, idx) => {
              console.log(`  ${idx + 1}. ${opt.label}`);
              console.log(`     ${opt.description}`);
            });

            console.log(`\nEnter 1-${q.options.length} (or press Enter for default):`);
            const answer = await readlineQuestion("> ");

            if (answer && answer.trim()) {
              const idx = parseInt(answer.trim()) - 1;
              if (idx >= 0 && idx < q.options.length) {
                // Keyed by id, not trait: a Big Five item has no trait, and for a trait
                // question id and trait are the same string anyway.
                answers[q.id] = q.options[idx].value;
                console.log(`  ✓ ${q.options[idx].label}`);
              }
            } else {
              console.log(`  → Using default (moderate)`);
            }
          }

          // Build persona
          console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(`Building persona...`);

          const traits = buildTraitsFromAnswers(answers);
          const persona = createCognitivePersona(personaName, `Custom persona created via questionnaire`, traits, {});
          const savedPath = saveCustomPersona(persona);

          console.log(`\n✓ Persona saved: ${savedPath}`);
          console.log(`\n📊 Trait Summary:`);

          // Show non-default traits
          for (const [trait, value] of Object.entries(traits)) {
            if (value !== 0.5) {
              const ref = TRAIT_REFERENCE_MATRIX.find(t => t.name === trait);
              if (ref) {
                const level = ref.levels.reduce((prev, curr) =>
                  Math.abs(curr.value - (value as number)) < Math.abs(prev.value - (value as number)) ? curr : prev
                );
                console.log(`  ${trait}: ${(value as number).toFixed(2)} (${level.label})`);
              }
            }
          }

          console.log(`\n💡 Use with: cbrowser cognitive-journey --persona "${personaName}" --start <url> --goal "<goal>"`);

          // Save answers if requested
          if (options.output) {
            const fs = await import("fs");
            fs.writeFileSync(options.output as string, JSON.stringify({ name: personaName, answers, traits }, null, 2));
            console.log(`\n📁 Answers saved: ${options.output}`);
          }
          break;
        }

        case "list-traits": {
          console.log(`\n🧠 CBrowser Cognitive Traits Reference`);
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(`${TRAIT_REFERENCE_MATRIX.length} traits available (scales named after the research each is drawn from; levels written by hand):\n`);

          for (const trait of TRAIT_REFERENCE_MATRIX) {
            console.log(`📍 ${trait.name}`);
            console.log(`   ${trait.description}`);
            console.log(`   Research: ${trait.researchBasis}`);
            console.log(`   Scale: ${trait.levels[0].label} (0) → ${trait.levels[4].label} (1)`);
            console.log();
          }
          break;
        }

        case "lookup": {
          const traitName = options.trait as string;
          const traitValue = parseFloat(options.value as string);

          if (!traitName) {
            console.error("Error: --trait <name> required");
            console.error("Use 'persona-questionnaire list-traits' to see available traits");
            process.exit(1);
          }

          if (isNaN(traitValue) || traitValue < 0 || traitValue > 1) {
            console.error("Error: --value must be a number between 0 and 1");
            process.exit(1);
          }

          const ref = getTraitReference(traitName as any);
          if (!ref) {
            console.error(`Error: Unknown trait "${traitName}"`);
            console.error("Use 'persona-questionnaire list-traits' to see available traits");
            process.exit(1);
          }

          const level = ref.levels.reduce((prev, curr) =>
            Math.abs(curr.value - traitValue) < Math.abs(prev.value - traitValue) ? curr : prev
          );

          console.log(`\n📍 ${ref.name} = ${traitValue}`);
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(`Description: ${ref.description}`);
          console.log(`Research: ${ref.researchBasis}`);
          console.log(`\nLevel: ${level.label} (${level.value})`);
          console.log(`\nBehaviors:`);
          for (const behavior of level.behaviors) {
            console.log(`  • ${behavior}`);
          }
          break;
        }

        default:
          console.error(`Unknown subcommand: ${subcommand}`);
          console.error("Use 'persona-questionnaire help' for usage");
          process.exit(1);
      }
      break;
    }

    default:
      return false;
  }
  return true;
}
