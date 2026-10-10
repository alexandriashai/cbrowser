/**
 * CBrowser - Site Model Manager
 * Persistent knowledge graph per site with incremental updates,
 * write-coalescing, data decay, and size-capped storage.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 * @since v18.35.0
 */

import * as fs from "fs/promises";
import { readFileSync } from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

import { scopedDataDir } from "../persona-scope.js";
import type {
  SiteModel,
  NavigationEdge,
  ElementReliability,
  GoalPath,
  GoalAction,
  GoalType,
  FailurePattern,
  FailureType,
  PageFingerprint,
  SiteModelStats,
  PruneResult,
} from "./types.js";

export class SiteModelManager {
  private modelDir: string;
  private models: Map<string, SiteModel>;
  private dirty: Set<string>;
  private writeTimer: NodeJS.Timeout | null;

  /** Singleton instance for process-wide sharing */
  private static _instance: SiteModelManager | null = null;

  /**
   * One instance per hosted account, keyed by that account's data dir.
   *
   * The singleton is one per process: on the hosted server its in-memory
   * models and its site-models directory served every account, so one
   * account's navigation history, element selectors, goal paths (action
   * values included) and failure patterns for a domain were read through
   * site_model_status, site_model_query and journey familiarity by any other
   * account, and written to by all of them. Inside an account scope each
   * account now gets its own instance under its own directory; unscoped
   * callers (CLI, stdio, local) keep the singleton. (tenant, 2026-10-10)
   */
  private static _scoped = new Map<string, SiteModelManager>();

  /** Get or create the instance for this call's scope */
  static getInstance(dataDir?: string): SiteModelManager {
    const scoped = dataDir === undefined ? scopedDataDir() : undefined;
    if (scoped !== undefined) {
      let instance = SiteModelManager._scoped.get(scoped);
      if (!instance) {
        instance = new SiteModelManager(scoped);
        SiteModelManager._scoped.set(scoped, instance);
      }
      return instance;
    }
    if (!SiteModelManager._instance) {
      SiteModelManager._instance = new SiteModelManager(dataDir);
    }
    return SiteModelManager._instance;
  }

  /** Maximum JSON size per domain model file */
  private static readonly MAX_MODEL_SIZE = 500 * 1024; // 500KB
  /** Data older than this is subject to decay/pruning */
  private static readonly DECAY_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  /** Write-coalescing debounce interval */
  private static readonly WRITE_DEBOUNCE_MS = 1000; // 1 second
  /** Minimum reliability/confidence before an entry is prunable */
  private static readonly MIN_CONFIDENCE = 0.1;
  /** Maximum goal paths stored per domain */
  private static readonly MAX_GOAL_PATHS = 50;
  /** Maximum failure patterns stored per domain */
  private static readonly MAX_FAILURE_PATTERNS = 100;
  /** Failure pattern expiry */
  private static readonly FAILURE_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

  constructor(dataDir?: string) {
    const baseDir =
      dataDir ||
      process.env.CBROWSER_DATA_DIR ||
      path.join(os.homedir(), ".cbrowser");
    this.modelDir = path.join(baseDir, "site-models");
    this.models = new Map();
    this.dirty = new Set();
    this.writeTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Public API: Loading
  // ---------------------------------------------------------------------------

  /**
   * Lazy-load a site model from disk. If no file exists, creates an empty model.
   * On load, stale data is pruned automatically.
   */
  async loadModel(domain: string): Promise<SiteModel> {
    const normalized = this.normalizeDomain(domain);
    const cached = this.models.get(normalized);
    if (cached) return cached;

    await fs.mkdir(this.modelDir, { recursive: true });
    const filePath = this.modelFilePath(normalized);

    let model: SiteModel;
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      model = JSON.parse(raw) as SiteModel;
      // Ensure domain field matches (handles renames/moves)
      model.domain = normalized;
    } catch {
      model = this.createEmptyModel(normalized);
    }

    // Prune stale entries on load
    this.pruneStaleData(normalized, model);

    this.models.set(normalized, model);
    return model;
  }

  /**
   * Get model from cache or create empty one in memory (synchronous).
   * This ensures record methods work without a prior loadModel() call.
   */
  private getOrCreateModel(domain: string): SiteModel {
    const normalized = this.normalizeDomain(domain);
    let model = this.models.get(normalized);
    if (!model) {
      // Read from disk SYNCHRONOUSLY, before caching anything.
      //
      // This used to cache an empty model first and then fire
      // `this.loadModel(normalized).catch(() => {})` to "merge any existing
      // data". It merged nothing: loadModel's own first lines are
      // `const cached = this.models.get(normalized); if (cached) return cached`,
      // and the empty model had just been placed in that cache — so the disk
      // read was a guaranteed no-op. markDirty then scheduled a flush 1s later
      // which wrote the near-empty model OVER the file, destroying every learned
      // navigation edge, selector, goal path and failure pattern for that
      // domain. Silently, because the .catch(() => {}) swallowed anything that
      // might have hinted at it.
      //
      // Trigger: any fresh process whose first site-model operation is a
      // record*/updateFingerprint call rather than an explicit loadModel — which
      // is the normal path. (2026-07-26)
      try {
        const loaded = JSON.parse(readFileSync(this.modelFilePath(normalized), "utf-8")) as SiteModel;
        loaded.domain = normalized;
        this.pruneStaleData(normalized, loaded);
        model = loaded;
      } catch {
        // No file yet, or unreadable/corrupt — an empty model is correct here.
        model = this.createEmptyModel(normalized);
      }
      this.models.set(normalized, model);
    }
    return model;
  }

  // ---------------------------------------------------------------------------
  // Public API: Recording
  // ---------------------------------------------------------------------------

  /**
   * Record a successful navigation from one page to another via a specific element.
   */
  recordNavigation(
    domain: string,
    fromUrl: string,
    toUrl: string,
    elementSelector: string,
    elementText: string,
  ): void {
    const normalized = this.normalizeDomain(domain);
    const model = this.getOrCreateModel(normalized);

    const now = Date.now();
    const fromPath = this.normalizeUrl(fromUrl);
    const toPath = this.normalizeUrl(toUrl);

    // Upsert fromUrl node
    if (!model.navigation.nodes[fromPath]) {
      model.navigation.nodes[fromPath] = {
        url: fromPath,
        lastVisited: now,
        visitCount: 1,
      };
    } else {
      model.navigation.nodes[fromPath].lastVisited = now;
      model.navigation.nodes[fromPath].visitCount++;
    }

    // Upsert toUrl node
    if (!model.navigation.nodes[toPath]) {
      model.navigation.nodes[toPath] = {
        url: toPath,
        lastVisited: now,
        visitCount: 1,
      };
    } else {
      model.navigation.nodes[toPath].lastVisited = now;
      model.navigation.nodes[toPath].visitCount++;
    }

    // Find or create edge
    const edge = model.navigation.edges.find(
      (e) =>
        e.fromUrl === fromPath &&
        e.toUrl === toPath &&
        e.elementSelector === elementSelector,
    );

    if (edge) {
      edge.successCount++;
      edge.lastUsed = now;
      edge.elementText = elementText; // Update text in case it changed
      edge.reliability =
        edge.successCount / (edge.successCount + edge.failureCount);
    } else {
      model.navigation.edges.push({
        fromUrl: fromPath,
        toUrl: toPath,
        elementSelector,
        elementText,
        successCount: 1,
        failureCount: 0,
        lastUsed: now,
        reliability: 1.0,
      });
    }

    model.lastUpdated = new Date().toISOString();
    this.markDirty(normalized);
  }

  /**
   * Record the result (success/failure) of interacting with a specific element.
   */
  /**
   * Record elements DISCOVERED on a page, without asserting anything about
   * their reliability.
   *
   * page_understand returns fully-formed affordances — selector, action,
   * confidence — and persisted none of them, so trackedElements never grew and
   * the workflow that site_model_status recommends produced a graph node and
   * nothing a persona could use.
   *
   * Discovery and reliability are deliberately separate. An entry created here
   * carries totalAttempts 0, which reads as "never tried" rather than "always
   * fails" — writing a 0 successRate for an untried element would poison every
   * consumer that treats the number as evidence. Re-running on the same page
   * MUST NOT reset an element that has since accumulated real outcomes, so an
   * existing entry only has its lastSeen refreshed.
   *
   * Returns how many entries were newly created, so a caller can report whether
   * the run actually learned anything.
   */
  recordDiscoveredElements(
    domain: string,
    pageUrl: string,
    selectors: string[],
  ): number {
    const normalized = this.normalizeDomain(domain);
    const model = this.getOrCreateModel(normalized);
    const pagePattern = this.normalizeUrl(pageUrl);

    let created = 0;
    for (const selector of selectors) {
      if (!selector) continue;
      const key = `${pagePattern}::${selector}`;
      const existing = model.elements[key];
      if (existing) {
        // Idempotent: a rediscovery is not new evidence about reliability.
        existing.lastVerified = Date.now();
        continue;
      }
      model.elements[key] = {
        selector,
        domain: normalized,
        pageUrlPattern: pagePattern,
        successRate: 0,
        totalAttempts: 0,
        alternatives: [],
        lastVerified: Date.now(),
        decayFactor: 1.0,
      };
      created++;
    }

    if (selectors.length > 0) {
      model.lastUpdated = new Date().toISOString();
      this.markDirty(normalized);
    }
    return created;
  }

  recordElementResult(
    domain: string,
    pageUrl: string,
    selector: string,
    success: boolean,
  ): void {
    const normalized = this.normalizeDomain(domain);
    const model = this.getOrCreateModel(normalized);

    const pagePattern = this.normalizeUrl(pageUrl);
    const key = `${pagePattern}::${selector}`;

    let entry = model.elements[key];
    if (!entry) {
      entry = {
        selector,
        domain: normalized,
        pageUrlPattern: pagePattern,
        successRate: 0,
        totalAttempts: 0,
        alternatives: [],
        lastVerified: Date.now(),
        decayFactor: 1.0,
      };
      model.elements[key] = entry;
    }

    entry.totalAttempts++;
    // Recalculate success rate incrementally
    const previousSuccesses = Math.round(
      entry.successRate * (entry.totalAttempts - 1),
    );
    const newSuccesses = previousSuccesses + (success ? 1 : 0);
    entry.successRate = newSuccesses / entry.totalAttempts;
    entry.lastVerified = Date.now();
    entry.decayFactor = 1.0; // Reset decay on fresh interaction

    model.lastUpdated = new Date().toISOString();
    this.markDirty(normalized);
  }

  /**
   * Record a completed goal path attempt (success or failure).
   * Matches existing paths by goalType + keyword overlap before creating new entries.
   */
  recordGoalPath(
    domain: string,
    goalDescription: string,
    goalType: GoalType,
    actions: GoalAction[],
    success: boolean,
    steps: number,
    persona?: string,
  ): void {
    const normalized = this.normalizeDomain(domain);
    const model = this.getOrCreateModel(normalized);

    const now = Date.now();

    // Try to find existing path with fuzzy match
    const existing = this.findSimilarGoalPath(
      model,
      goalDescription,
      goalType,
    );

    if (existing) {
      // Update existing path stats
      existing.attemptCount++;
      const previousSuccesses = Math.round(
        existing.successRate * (existing.attemptCount - 1),
      );
      existing.successRate =
        (previousSuccesses + (success ? 1 : 0)) / existing.attemptCount;
      existing.averageSteps =
        (existing.averageSteps * (existing.attemptCount - 1) + steps) /
        existing.attemptCount;
      existing.lastUsed = now;

      // Update action sequence if this attempt was successful (prefer successful paths)
      if (success) {
        existing.actionSequence = actions;
      }

      // Record persona performance
      if (persona) {
        existing.personaPerformance[persona] = { success, steps };
      }
    } else {
      // Create new goal path
      const newPath: GoalPath = {
        goalDescription,
        goalType,
        actionSequence: actions,
        successRate: success ? 1.0 : 0.0,
        attemptCount: 1,
        averageSteps: steps,
        personaPerformance: persona
          ? { [persona]: { success, steps } }
          : {},
        lastUsed: now,
      };
      model.goalPaths.push(newPath);

      // Enforce cap: remove least useful paths if over limit
      if (model.goalPaths.length > SiteModelManager.MAX_GOAL_PATHS) {
        this.evictGoalPaths(model);
      }
    }

    model.lastUpdated = new Date().toISOString();
    this.markDirty(normalized);
  }

  /**
   * Record a failure pattern for a page/element combination.
   */
  recordFailure(
    domain: string,
    pageUrl: string,
    selector: string | undefined,
    failureType: FailureType,
    conditions: string[],
  ): void {
    const normalized = this.normalizeDomain(domain);
    const model = this.getOrCreateModel(normalized);

    const now = Date.now();
    const pagePattern = this.normalizeUrl(pageUrl);

    // Find existing pattern matching page + failure type + selector
    const existing = model.failures.find(
      (f) =>
        f.pageUrlPattern === pagePattern &&
        f.failureType === failureType &&
        f.elementSelector === selector,
    );

    if (existing) {
      existing.frequency++;
      existing.lastSeen = now;
      // Merge new conditions (deduplicated)
      for (const cond of conditions) {
        if (!existing.conditions.includes(cond)) {
          existing.conditions.push(cond);
        }
      }
    } else {
      const pattern: FailurePattern = {
        pageUrlPattern: pagePattern,
        elementSelector: selector,
        failureType,
        frequency: 1,
        conditions: [...conditions],
        lastSeen: now,
      };
      model.failures.push(pattern);

      // Enforce cap
      if (model.failures.length > SiteModelManager.MAX_FAILURE_PATTERNS) {
        this.evictFailurePatterns(model);
      }
    }

    // Also record as a failed navigation edge if selector is provided
    if (selector) {
      const key = `${pagePattern}::${selector}`;
      const elem = model.elements[key];
      if (elem) {
        elem.totalAttempts++;
        const previousSuccesses = Math.round(
          elem.successRate * (elem.totalAttempts - 1),
        );
        elem.successRate = previousSuccesses / elem.totalAttempts;
        elem.lastVerified = now;
      }
    }

    model.lastUpdated = new Date().toISOString();
    this.markDirty(normalized);
  }

  /**
   * Update or create a page fingerprint for structural change detection.
   */
  updateFingerprint(
    domain: string,
    urlPattern: string,
    headingHash: string,
    formCount: number,
    navLinkCount: number,
    ctaCount: number,
    pageType?: string,
  ): void {
    const normalized = this.normalizeDomain(domain);
    const model = this.getOrCreateModel(normalized);

    const normalizedPattern = this.normalizeUrl(urlPattern);

    const existing = model.fingerprints[normalizedPattern];
    if (existing) {
      // If heading structure changed, decay element reliability for this page
      if (existing.headingStructureHash !== headingHash) {
        this.decayElementsForPage(model, normalizedPattern);
      }
    }

    model.fingerprints[normalizedPattern] = {
      urlPattern: normalizedPattern,
      headingStructureHash: headingHash,
      formCount,
      navLinkCount,
      ctaCount,
      pageType,
      lastSeen: Date.now(),
    };

    model.lastUpdated = new Date().toISOString();
    this.markDirty(normalized);
  }

  // ---------------------------------------------------------------------------
  // Public API: Querying
  // ---------------------------------------------------------------------------

  /**
   * Find the best known path for a given goal type.
   * Weights by successRate * attemptCount to favor frequently successful paths.
   */
  queryBestPath(domain: string, goalType: GoalType): GoalPath | null {
    const normalized = this.normalizeDomain(domain);
    const model = this.models.get(normalized);
    if (!model) return null;

    const matching = model.goalPaths.filter((p) => p.goalType === goalType);
    if (matching.length === 0) return null;

    matching.sort((a, b) => {
      const scoreA = a.successRate * a.attemptCount;
      const scoreB = b.successRate * b.attemptCount;
      return scoreB - scoreA;
    });

    return matching[0];
  }

  /**
   * Get the reliability score for a specific selector on a domain.
   * Returns the success rate multiplied by decay factor. Returns 0 if unknown.
   */
  queryElementReliability(domain: string, selector: string): number {
    const normalized = this.normalizeDomain(domain);
    const model = this.models.get(normalized);
    if (!model) return 0;

    // Search across all page patterns for this selector
    for (const [_key, entry] of Object.entries(model.elements)) {
      if (entry.selector === selector && entry.domain === normalized) {
        return entry.successRate * entry.decayFactor;
      }
    }

    return 0;
  }

  /**
   * Get all known navigation edges departing from a given URL.
   * Sorted by reliability descending.
   */
  queryNavigationTargets(
    domain: string,
    fromUrl: string,
  ): NavigationEdge[] {
    const normalized = this.normalizeDomain(domain);
    const model = this.models.get(normalized);
    if (!model) return [];

    const fromPath = this.normalizeUrl(fromUrl);
    const edges = model.navigation.edges.filter(
      (e) => e.fromUrl === fromPath,
    );

    return edges.sort((a, b) => b.reliability - a.reliability);
  }

  // ---------------------------------------------------------------------------
  // Public API: Maintenance
  // ---------------------------------------------------------------------------

  /**
   * Prune stale data from a domain's model. Can operate on a provided model
   * (used during load) or look up the cached model by domain.
   */
  pruneStaleData(domain: string, targetModel?: SiteModel): PruneResult {
    const normalized = this.normalizeDomain(domain);
    const model = targetModel || this.models.get(normalized);

    const result: PruneResult = {
      edgesRemoved: 0,
      elementsRemoved: 0,
      pathsRemoved: 0,
      failuresRemoved: 0,
      fingerprintsRemoved: 0,
    };

    if (!model) return result;

    const now = Date.now();
    const decayThreshold = now - SiteModelManager.DECAY_THRESHOLD_MS;
    const failureExpiry = now - SiteModelManager.FAILURE_EXPIRY_MS;

    // --- Edges: decay old ones, remove unreliable ---
    const edgesBefore = model.navigation.edges.length;
    for (const edge of model.navigation.edges) {
      if (edge.lastUsed < decayThreshold) {
        edge.reliability *= 0.5; // Reduce reliability by 50%
      }
    }
    model.navigation.edges = model.navigation.edges.filter(
      (e) => e.reliability >= 0.05,
    );
    result.edgesRemoved = edgesBefore - model.navigation.edges.length;

    // --- Elements: apply time-based decay, remove low-confidence ---
    const elementKeys = Object.keys(model.elements);
    for (const key of elementKeys) {
      const elem = model.elements[key];
      if (elem.lastVerified < decayThreshold) {
        // Apply time-based decay proportional to staleness
        const staleDays =
          (now - elem.lastVerified) / (24 * 60 * 60 * 1000);
        elem.decayFactor = Math.max(
          0,
          elem.decayFactor - staleDays * 0.01,
        );
      }
      if (elem.decayFactor < SiteModelManager.MIN_CONFIDENCE) {
        delete model.elements[key];
        result.elementsRemoved++;
      }
    }

    // --- Goal paths: remove persistently failing ones ---
    const pathsBefore = model.goalPaths.length;
    model.goalPaths = model.goalPaths.filter(
      (p) => !(p.successRate === 0 && p.attemptCount > 3),
    );
    result.pathsRemoved = pathsBefore - model.goalPaths.length;

    // --- Failure patterns: remove expired ---
    const failuresBefore = model.failures.length;
    model.failures = model.failures.filter(
      (f) => f.lastSeen >= failureExpiry,
    );
    result.failuresRemoved = failuresBefore - model.failures.length;

    // --- Fingerprints: remove very old ones (use failure expiry as threshold) ---
    const fpKeys = Object.keys(model.fingerprints);
    for (const key of fpKeys) {
      if (model.fingerprints[key].lastSeen < failureExpiry) {
        delete model.fingerprints[key];
        result.fingerprintsRemoved++;
      }
    }

    // Clean up orphaned navigation nodes (nodes with no edges)
    this.pruneOrphanedNodes(model);

    if (!targetModel) {
      // If operating on cached model, mark dirty so changes persist
      const anyPruned =
        result.edgesRemoved > 0 ||
        result.elementsRemoved > 0 ||
        result.pathsRemoved > 0 ||
        result.failuresRemoved > 0 ||
        result.fingerprintsRemoved > 0;
      if (anyPruned) {
        this.markDirty(normalized);
      }
    }

    return result;
  }

  /**
   * Get comprehensive statistics for a domain's model.
   */
  async getModelStats(domain: string): Promise<SiteModelStats> {
    const normalized = this.normalizeDomain(domain);
    const model = await this.getModel(normalized);

    // Compute model size
    const json = JSON.stringify(model);
    const sizeBytes = Buffer.byteLength(json, "utf-8");

    // Find oldest data timestamp across all entities
    let oldest = Infinity;

    for (const node of Object.values(model.navigation.nodes)) {
      if (node.lastVisited < oldest) oldest = node.lastVisited;
    }
    for (const edge of model.navigation.edges) {
      if (edge.lastUsed < oldest) oldest = edge.lastUsed;
    }
    for (const elem of Object.values(model.elements)) {
      if (elem.lastVerified < oldest) oldest = elem.lastVerified;
    }
    for (const gp of model.goalPaths) {
      if (gp.lastUsed < oldest) oldest = gp.lastUsed;
    }
    for (const fp of Object.values(model.fingerprints)) {
      if (fp.lastSeen < oldest) oldest = fp.lastSeen;
    }

    return {
      domain: normalized,
      navigationNodes: Object.keys(model.navigation.nodes).length,
      navigationEdges: model.navigation.edges.length,
      trackedElements: Object.keys(model.elements).length,
      goalPaths: model.goalPaths.length,
      failurePatterns: model.failures.length,
      pageFingerprints: Object.keys(model.fingerprints).length,
      modelSizeBytes: sizeBytes,
      lastUpdated: model.lastUpdated,
      oldestData:
        oldest === Infinity
          ? model.created
          : new Date(oldest).toISOString(),
    };
  }

  /**
   * Flush all pending writes and clear the debounce timer.
   * Call this on process shutdown to avoid data loss.
   */
  async shutdown(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    await this.flushDirty();
  }

  // ---------------------------------------------------------------------------
  // Private: Write Coalescing
  // ---------------------------------------------------------------------------

  /**
   * Mark a domain's model as needing a write to disk.
   * Starts a debounce timer if one isn't already running.
   */
  private markDirty(domain: string): void {
    this.dirty.add(domain);
    if (!this.writeTimer) {
      this.writeTimer = setTimeout(async () => {
        this.writeTimer = null;
        await this.flushDirty();
      }, SiteModelManager.WRITE_DEBOUNCE_MS);
    }
  }

  /**
   * Write all dirty models to disk. Enforces size cap before writing.
   */
  private async flushDirty(): Promise<void> {
    const domains = [...this.dirty];
    this.dirty.clear();

    await fs.mkdir(this.modelDir, { recursive: true });

    const writePromises = domains.map(async (domain) => {
      const model = this.models.get(domain);
      if (!model) return;

      // Enforce size cap before writing
      this.enforceModelSizeCap(model);

      const filePath = this.modelFilePath(domain);
      const json = JSON.stringify(model, null, 2);

      // Write atomically: write to temp file, then rename
      const tmpPath = `${filePath}.tmp.${crypto.randomBytes(4).toString("hex")}`;
      try {
        await fs.writeFile(tmpPath, json, "utf-8");
        await fs.rename(tmpPath, filePath);
      } catch (err) {
        // Clean up temp file on failure
        try {
          await fs.unlink(tmpPath);
        } catch {
          // Ignore cleanup errors
        }
        throw err;
      }
    });

    await Promise.allSettled(writePromises);
  }

  // ---------------------------------------------------------------------------
  // Private: Size Enforcement
  // ---------------------------------------------------------------------------

  /**
   * Enforce the 500KB per-domain model size cap.
   * Evicts oldest/least-used data until the model fits within the cap.
   */
  private enforceModelSizeCap(model: SiteModel): void {
    let json = JSON.stringify(model);
    let size = Buffer.byteLength(json, "utf-8");

    if (size <= SiteModelManager.MAX_MODEL_SIZE) return;

    // Phase 1: Remove oldest edges
    while (
      size > SiteModelManager.MAX_MODEL_SIZE &&
      model.navigation.edges.length > 0
    ) {
      model.navigation.edges.sort((a, b) => a.lastUsed - b.lastUsed);
      // Remove bottom 10% or at least 1
      const removeCount = Math.max(
        1,
        Math.floor(model.navigation.edges.length * 0.1),
      );
      model.navigation.edges.splice(0, removeCount);

      json = JSON.stringify(model);
      size = Buffer.byteLength(json, "utf-8");
    }

    // Phase 2: Remove oldest elements
    if (size > SiteModelManager.MAX_MODEL_SIZE) {
      const entries = Object.entries(model.elements).sort(
        ([, a], [, b]) => a.lastVerified - b.lastVerified,
      );
      while (
        size > SiteModelManager.MAX_MODEL_SIZE &&
        entries.length > 0
      ) {
        const removeCount = Math.max(
          1,
          Math.floor(entries.length * 0.1),
        );
        const removed = entries.splice(0, removeCount);
        for (const [key] of removed) {
          delete model.elements[key];
        }
        json = JSON.stringify(model);
        size = Buffer.byteLength(json, "utf-8");
      }
    }

    // Phase 3: Remove oldest goal paths
    if (size > SiteModelManager.MAX_MODEL_SIZE) {
      model.goalPaths.sort((a, b) => a.lastUsed - b.lastUsed);
      while (
        size > SiteModelManager.MAX_MODEL_SIZE &&
        model.goalPaths.length > 0
      ) {
        const removeCount = Math.max(
          1,
          Math.floor(model.goalPaths.length * 0.1),
        );
        model.goalPaths.splice(0, removeCount);
        json = JSON.stringify(model);
        size = Buffer.byteLength(json, "utf-8");
      }
    }

    // Phase 4: Remove oldest failure patterns
    if (size > SiteModelManager.MAX_MODEL_SIZE) {
      model.failures.sort((a, b) => a.lastSeen - b.lastSeen);
      while (
        size > SiteModelManager.MAX_MODEL_SIZE &&
        model.failures.length > 0
      ) {
        const removeCount = Math.max(
          1,
          Math.floor(model.failures.length * 0.1),
        );
        model.failures.splice(0, removeCount);
        json = JSON.stringify(model);
        size = Buffer.byteLength(json, "utf-8");
      }
    }

    // Phase 5: Remove oldest fingerprints
    if (size > SiteModelManager.MAX_MODEL_SIZE) {
      const fpEntries = Object.entries(model.fingerprints).sort(
        ([, a], [, b]) => a.lastSeen - b.lastSeen,
      );
      while (
        size > SiteModelManager.MAX_MODEL_SIZE &&
        fpEntries.length > 0
      ) {
        const removeCount = Math.max(
          1,
          Math.floor(fpEntries.length * 0.1),
        );
        const removed = fpEntries.splice(0, removeCount);
        for (const [key] of removed) {
          delete model.fingerprints[key];
        }
        json = JSON.stringify(model);
        size = Buffer.byteLength(json, "utf-8");
      }
    }

    // Final cleanup: prune orphaned nodes
    this.pruneOrphanedNodes(model);
  }

  // ---------------------------------------------------------------------------
  // Private: Helpers
  // ---------------------------------------------------------------------------

  /**
   * Create a fresh, empty site model for a domain.
   */
  private createEmptyModel(domain: string): SiteModel {
    const now = new Date().toISOString();
    return {
      domain,
      version: 1,
      created: now,
      lastUpdated: now,
      navigation: {
        nodes: {},
        edges: [],
      },
      elements: {},
      goalPaths: [],
      failures: [],
      fingerprints: {},
    };
  }

  /**
   * Get a model, loading from disk if necessary.
   */
  private async getModel(domain: string): Promise<SiteModel> {
    const normalized = this.normalizeDomain(domain);
    const cached = this.models.get(normalized);
    if (cached) return cached;
    return this.loadModel(normalized);
  }

  /**
   * Build the file path for a domain's model JSON.
   * Sanitizes domain to be filesystem-safe.
   */
  private modelFilePath(domain: string): string {
    // Replace characters that are problematic on filesystems
    const safeName = domain.replace(/[^a-zA-Z0-9.-]/g, "_");
    return path.join(this.modelDir, `${safeName}.json`);
  }

  /**
   * Normalize a domain string: lowercase, strip protocol, strip trailing slash.
   */
  private normalizeDomain(domain: string): string {
    return domain
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "")
      .replace(/:\d+$/, ""); // Strip port for consistency
  }

  /**
   * Normalize a URL to just its path for consistent node keys.
   * Strips query strings, hashes, and trailing slashes.
   */
  private normalizeUrl(url: string): string {
    try {
      // Handle both full URLs and path-only strings
      if (url.startsWith("http://") || url.startsWith("https://")) {
        const parsed = new URL(url);
        return parsed.pathname.replace(/\/+$/, "") || "/";
      }
      // Already a path - strip query and hash
      const path = url.split("?")[0].split("#")[0];
      return path.replace(/\/+$/, "") || "/";
    } catch {
      // Fallback: strip query/hash manually
      const path = url.split("?")[0].split("#")[0];
      return path.replace(/\/+$/, "") || "/";
    }
  }

  /**
   * Find a similar goal path using goalType + keyword overlap in descriptions.
   * Returns the best match if keyword overlap exceeds 50%.
   */
  private findSimilarGoalPath(
    model: SiteModel,
    goalDescription: string,
    goalType: GoalType,
  ): GoalPath | null {
    const descWords = this.extractKeywords(goalDescription);
    if (descWords.length === 0) return null;

    let bestMatch: GoalPath | null = null;
    let bestOverlap = 0;

    for (const gp of model.goalPaths) {
      if (gp.goalType !== goalType) continue;

      const existingWords = this.extractKeywords(gp.goalDescription);
      if (existingWords.length === 0) continue;

      // Calculate Jaccard-like overlap
      const intersection = descWords.filter((w) =>
        existingWords.includes(w),
      ).length;
      const union = new Set([...descWords, ...existingWords]).size;
      const overlap = intersection / union;

      if (overlap > 0.5 && overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = gp;
      }
    }

    return bestMatch;
  }

  /**
   * Extract meaningful keywords from a goal description for fuzzy matching.
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "to",
      "of",
      "in",
      "for",
      "on",
      "with",
      "at",
      "by",
      "from",
      "and",
      "or",
      "but",
      "not",
      "this",
      "that",
      "it",
      "its",
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));
  }

  /**
   * Evict the least valuable goal paths when over the cap.
   * Score = successRate * attemptCount * recency_weight
   */
  private evictGoalPaths(model: SiteModel): void {
    const now = Date.now();
    model.goalPaths.sort((a, b) => {
      const recencyA = 1 / (1 + (now - a.lastUsed) / (24 * 60 * 60 * 1000));
      const recencyB = 1 / (1 + (now - b.lastUsed) / (24 * 60 * 60 * 1000));
      const scoreA = a.successRate * a.attemptCount * recencyA;
      const scoreB = b.successRate * b.attemptCount * recencyB;
      return scoreB - scoreA; // Keep highest scores
    });
    model.goalPaths = model.goalPaths.slice(
      0,
      SiteModelManager.MAX_GOAL_PATHS,
    );
  }

  /**
   * Evict the least relevant failure patterns when over the cap.
   * Keeps the most recent and most frequent patterns.
   */
  private evictFailurePatterns(model: SiteModel): void {
    model.failures.sort((a, b) => {
      // Composite score: recency * frequency
      const scoreA = a.lastSeen * Math.log2(a.frequency + 1);
      const scoreB = b.lastSeen * Math.log2(b.frequency + 1);
      return scoreB - scoreA;
    });
    model.failures = model.failures.slice(
      0,
      SiteModelManager.MAX_FAILURE_PATTERNS,
    );
  }

  /**
   * When a page's structure changes (fingerprint hash differs),
   * decay element reliability for selectors associated with that page.
   */
  private decayElementsForPage(
    model: SiteModel,
    pagePattern: string,
  ): void {
    for (const [_key, elem] of Object.entries(model.elements)) {
      if (elem.pageUrlPattern === pagePattern) {
        elem.decayFactor *= 0.5; // 50% decay on structural change
      }
    }
  }

  /**
   * Remove navigation nodes that have no edges referencing them
   * and have not been visited recently.
   */
  private pruneOrphanedNodes(model: SiteModel): void {
    const referencedUrls = new Set<string>();
    for (const edge of model.navigation.edges) {
      referencedUrls.add(edge.fromUrl);
      referencedUrls.add(edge.toUrl);
    }

    const now = Date.now();
    for (const [url, node] of Object.entries(model.navigation.nodes)) {
      if (
        !referencedUrls.has(url) &&
        now - node.lastVisited > SiteModelManager.DECAY_THRESHOLD_MS
      ) {
        delete model.navigation.nodes[url];
      }
    }
  }
}
