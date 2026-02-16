/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Tool Definition Pinning for CBrowser MCP Server
 *
 * Provides hash verification for MCP tool definitions to detect tampering.
 * Creates a manifest of tool hashes on first use and verifies against it
 * on subsequent uses.
 *
 * Security Model:
 * - Tool definitions (name, description, schema) are hashed on registration
 * - Hashes are stored in ~/.cbrowser/tool-manifest.json
 * - On each startup, hashes are verified against the manifest
 * - Changes are detected and reported (warn-only mode for now)
 *
 * Usage:
 *   import { verifyToolDefinitions } from "./security/tool-pinning.js";
 *
 *   const tools = collectToolDefinitions(server);
 *   const result = verifyToolDefinitions(tools);
 *   if (result.status === "changed") {
 *     console.warn("Tool definitions changed:", result.message);
 *   }
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../config.js";
import { VERSION } from "../version.js";

// ============================================================================
// Types
// ============================================================================

/**
 * A tool definition for pinning purposes.
 * Extracted from MCP server tool registration.
 */
export interface ToolDefinition {
  /** Tool name (unique identifier) */
  name: string;
  /** Tool description */
  description: string;
  /** Tool input schema (Zod schema converted to JSON Schema) */
  schema: unknown;
}

/**
 * Entry for a single pinned tool in the manifest.
 */
export interface ToolPinEntry {
  /** SHA-256 hash of name + description + JSON.stringify(schema) */
  hash: string;
  /** Length of description (for quick diff detection) */
  descriptionLength: number;
  /** Number of parameters in schema (for quick diff detection) */
  parameterCount: number;
  /** ISO timestamp when this tool was pinned */
  pinnedAt: string;
}

/**
 * The complete tool manifest stored on disk.
 */
export interface ToolManifest {
  /** Server identifier */
  server: string;
  /** CBrowser version that created this manifest */
  version: string;
  /** ISO timestamp when manifest was created */
  pinnedAt: string;
  /** Map of tool name -> pin entry */
  tools: Record<string, ToolPinEntry>;
}

/**
 * Result of verifying tool definitions against the manifest.
 */
export interface PinningResult {
  /** Overall status */
  status: "created" | "verified" | "changed" | "error";
  /** Tools that have different hashes than pinned */
  changedTools?: string[];
  /** Tools present in definitions but not in manifest */
  newTools?: string[];
  /** Tools in manifest but not in definitions */
  removedTools?: string[];
  /** Human-readable message */
  message: string;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get the path to the tool manifest file.
 * Uses ~/.cbrowser/tool-manifest.json by default.
 */
export function getManifestPath(): string {
  const dataDir = getDataDir();
  return join(dataDir, "tool-manifest.json");
}

/**
 * Create a SHA-256 hash of a tool definition.
 *
 * The hash includes:
 * - Tool name
 * - Tool description
 * - JSON-stringified schema (sorted keys for consistency)
 *
 * @param name - Tool name
 * @param description - Tool description
 * @param schema - Tool schema object
 * @returns 64-character hex SHA-256 hash
 */
export function hashToolDefinition(
  name: string,
  description: string,
  schema: unknown
): string {
  // Use sorted JSON for consistent hashing
  const payload = JSON.stringify({
    name,
    description,
    schema: sortObjectKeys(schema),
  });

  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Recursively sort object keys for consistent JSON stringification.
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  for (const key of keys) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Count the number of parameters in a schema.
 * Assumes top-level keys are parameters.
 */
function countParameters(schema: unknown): number {
  if (schema === null || typeof schema !== "object") {
    return 0;
  }
  return Object.keys(schema as Record<string, unknown>).length;
}

/**
 * Create a new tool manifest from a list of tool definitions.
 *
 * @param tools - Array of tool definitions
 * @returns Complete manifest ready for saving
 */
export function createToolManifest(tools: ToolDefinition[]): ToolManifest {
  const now = new Date().toISOString();
  const toolEntries: Record<string, ToolPinEntry> = {};

  for (const tool of tools) {
    toolEntries[tool.name] = {
      hash: hashToolDefinition(tool.name, tool.description, tool.schema),
      descriptionLength: tool.description.length,
      parameterCount: countParameters(tool.schema),
      pinnedAt: now,
    };
  }

  return {
    server: "cbrowser",
    version: VERSION,
    pinnedAt: now,
    tools: toolEntries,
  };
}

/**
 * Load the tool manifest from disk.
 *
 * @returns Manifest if it exists and is valid, null otherwise
 */
export function loadToolManifest(): ToolManifest | null {
  const path = getManifestPath();

  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, "utf-8");
    const manifest = JSON.parse(content) as ToolManifest;

    // Basic validation
    if (!manifest.server || !manifest.tools) {
      console.error("[Tool Pinning] Invalid manifest structure");
      return null;
    }

    return manifest;
  } catch (error) {
    console.error("[Tool Pinning] Failed to load manifest:", (error as Error).message);
    return null;
  }
}

/**
 * Save a tool manifest to disk.
 * Creates the directory if it doesn't exist.
 *
 * @param manifest - The manifest to save
 */
export function saveToolManifest(manifest: ToolManifest): void {
  const path = getManifestPath();
  const dir = join(path, "..");

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const content = JSON.stringify(manifest, null, 2);
  writeFileSync(path, content, "utf-8");
}

/**
 * Verify tool definitions against the pinned manifest.
 *
 * Behavior:
 * - If no manifest exists: Creates one and returns status "created"
 * - If all hashes match: Returns status "verified"
 * - If any differences: Returns status "changed" with details
 *
 * @param tools - Current tool definitions from MCP server
 * @returns Verification result
 */
export function verifyToolDefinitions(tools: ToolDefinition[]): PinningResult {
  const existingManifest = loadToolManifest();

  // No manifest exists - create one
  if (!existingManifest) {
    const manifest = createToolManifest(tools);
    saveToolManifest(manifest);
    return {
      status: "created",
      message: `Tool manifest created with ${tools.length} tools`,
    };
  }

  // Compare current tools against manifest
  const currentToolNames = new Set(tools.map((t) => t.name));
  const pinnedToolNames = new Set(Object.keys(existingManifest.tools));

  const changedTools: string[] = [];
  const newTools: string[] = [];
  const removedTools: string[] = [];

  // Check each current tool
  for (const tool of tools) {
    const pinEntry = existingManifest.tools[tool.name];

    if (!pinEntry) {
      // Tool exists in current but not in manifest
      newTools.push(tool.name);
    } else {
      // Tool exists in both - verify hash
      const currentHash = hashToolDefinition(tool.name, tool.description, tool.schema);
      if (currentHash !== pinEntry.hash) {
        changedTools.push(tool.name);
      }
    }
  }

  // Check for removed tools
  for (const pinnedName of pinnedToolNames) {
    if (!currentToolNames.has(pinnedName)) {
      removedTools.push(pinnedName);
    }
  }

  // Determine overall status
  const hasChanges =
    changedTools.length > 0 || newTools.length > 0 || removedTools.length > 0;

  if (!hasChanges) {
    return {
      status: "verified",
      message: `All ${tools.length} tool definitions verified successfully`,
    };
  }

  // Build change message
  const parts: string[] = [];
  if (changedTools.length > 0) {
    parts.push(`${changedTools.length} modified: ${changedTools.join(", ")}`);
  }
  if (newTools.length > 0) {
    parts.push(`${newTools.length} new: ${newTools.join(", ")}`);
  }
  if (removedTools.length > 0) {
    parts.push(`${removedTools.length} removed: ${removedTools.join(", ")}`);
  }

  return {
    status: "changed",
    changedTools: changedTools.length > 0 ? changedTools : undefined,
    newTools: newTools.length > 0 ? newTools : undefined,
    removedTools: removedTools.length > 0 ? removedTools : undefined,
    message: `Tool definition changes detected: ${parts.join("; ")}`,
  };
}

/**
 * Approve a tool change by updating its hash in the manifest.
 * Used to re-approve a tool after intentional modification.
 *
 * @param toolName - Name of the tool to approve
 * @param tool - Current tool definition
 * @throws Error if no manifest exists
 */
export function approveToolChange(toolName: string, tool: ToolDefinition): void {
  const manifest = loadToolManifest();

  if (!manifest) {
    throw new Error("Cannot approve tool change: no manifest exists");
  }

  const now = new Date().toISOString();

  manifest.tools[toolName] = {
    hash: hashToolDefinition(tool.name, tool.description, tool.schema),
    descriptionLength: tool.description.length,
    parameterCount: countParameters(tool.schema),
    pinnedAt: now,
  };

  saveToolManifest(manifest);
}

/**
 * Remove a tool from the manifest.
 * Used when a tool is intentionally removed.
 *
 * @param toolName - Name of the tool to remove
 * @throws Error if no manifest exists
 */
export function removeToolFromManifest(toolName: string): void {
  const manifest = loadToolManifest();

  if (!manifest) {
    throw new Error("Cannot remove tool: no manifest exists");
  }

  if (manifest.tools[toolName]) {
    delete manifest.tools[toolName];
    saveToolManifest(manifest);
  }
}

/**
 * Approve all current tools, replacing the entire manifest.
 * Use with caution - this trusts the current state completely.
 *
 * @param tools - Current tool definitions
 */
export function approveAllTools(tools: ToolDefinition[]): void {
  const manifest = createToolManifest(tools);
  saveToolManifest(manifest);
}

/**
 * Get a summary of the current manifest for status display.
 */
export function getManifestSummary(): {
  exists: boolean;
  toolCount: number;
  version: string | null;
  pinnedAt: string | null;
} {
  const manifest = loadToolManifest();

  if (!manifest) {
    return {
      exists: false,
      toolCount: 0,
      version: null,
      pinnedAt: null,
    };
  }

  return {
    exists: true,
    toolCount: Object.keys(manifest.tools).length,
    version: manifest.version,
    pinnedAt: manifest.pinnedAt,
  };
}
