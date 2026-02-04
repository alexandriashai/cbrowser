// commitlint.config.js
// Enforces Conventional Commits: https://www.conventionalcommits.org/
// Per Semantic Versioning: https://semver.org/

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Type must be one of the following
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature (MINOR version bump)
        'fix',      // Bug fix (PATCH version bump)
        'docs',     // Documentation only
        'style',    // Formatting, missing semicolons, etc.
        'refactor', // Code change that neither fixes a bug nor adds a feature
        'perf',     // Performance improvement
        'test',     // Adding or correcting tests
        'build',    // Changes to build system or dependencies
        'ci',       // Changes to CI configuration
        'chore',    // Other changes that don't modify src or test files
        'revert',   // Reverts a previous commit
      ],
    ],
    // Type must be lowercase
    'type-case': [2, 'always', 'lower-case'],
    // Subject must not be empty
    'subject-empty': [2, 'never'],
    // Subject must not end with period
    'subject-full-stop': [2, 'never', '.'],
    // Header max length 100 characters
    'header-max-length': [2, 'always', 100],
    // Body max line length 200 characters (allows URLs)
    'body-max-line-length': [2, 'always', 200],
  },
  // Help message for invalid commits
  helpUrl: 'https://www.conventionalcommits.org/',
};

/*
 * Semantic Versioning (semver.org) mapping:
 *
 * MAJOR version (breaking changes):
 *   - Any commit with "BREAKING CHANGE:" in footer
 *   - Any commit with "!" after type (e.g., "feat!: remove API")
 *
 * MINOR version (new features, backwards compatible):
 *   - feat: A new feature
 *
 * PATCH version (bug fixes, backwards compatible):
 *   - fix: A bug fix
 *   - perf: A performance improvement
 *
 * No version bump:
 *   - docs, style, refactor, test, build, ci, chore
 *
 * Examples:
 *   feat: add session export command
 *   fix: handle SecurityError in session save
 *   feat!: remove deprecated API endpoints    <- MAJOR
 *   fix: resolve race condition
 *
 *   feat: add visual regression testing
 *
 *   BREAKING CHANGE: session format changed   <- MAJOR
 */
