/**
 * Preloaded by tests/real-personas-dir.test.ts (`bun test --preload`), so it
 * runs before any test file in that process.
 *
 * It imports personas.ts with no CBROWSER_DATA_DIR set, as most suite files
 * do. Bun shares one module registry across the files of a process, so every
 * later file gets this same module instance. Through 21.0 personas.ts read
 * CBROWSER_DATA_DIR once, at import: a writer that set its own temp dir after
 * this point still saved into ~/.cbrowser/personas.
 *
 * A preload rather than a first test file because `bun test` does not
 * promise to run files in the order given. Not named *.test.ts, so the
 * suite's discovery (scripts/test-split.sh) never runs it on its own.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
delete process.env.CBROWSER_DATA_DIR;
await import("../../src/personas.js");
