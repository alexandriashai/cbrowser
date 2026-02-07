/**
 * Version management - single source of truth
 *
 * Reads version from package.json to avoid hardcoded version strings
 * that drift out of sync during releases.
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { createRequire } from 'module';

// Create require function to resolve package location (works in ESM context)
const require = createRequire(import.meta.url);

// Get this package's directory by resolving its own package.json
function getPackageDir(): string {
  try {
    // This resolves to the actual cbrowser package location, even when run via npx
    const pkgPath = require.resolve('cbrowser/package.json');
    return dirname(pkgPath);
  } catch {
    // Fallback: we're probably running from source
    try {
      // Try to resolve relative to this file
      const selfPath = require.resolve('./version.js');
      return dirname(dirname(selfPath)); // Go up from dist/version.js to package root
    } catch {
      return process.cwd();
    }
  }
}

// Read version from package.json
function getPackageVersion(): string {
  const packageDir = getPackageDir();

  const possiblePaths = [
    // Package's own package.json (primary - works with npx)
    join(packageDir, 'package.json'),
    // When running from project root during development
    join(process.cwd(), 'package.json'),
  ];

  for (const pkgPath of possiblePaths) {
    try {
      if (existsSync(pkgPath)) {
        const content = readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(content) as { version?: string; name?: string };
        // Only use if it's the cbrowser package
        if (pkg.version && pkg.name === 'cbrowser') {
          return pkg.version;
        }
      }
    } catch {
      // Try next path
    }
  }

  // Fallback if package.json not found
  return '0.0.0';
}

export const VERSION = getPackageVersion();
export default VERSION;
