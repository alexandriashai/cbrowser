/**
 * Device-name normalisation, shared by src/devices.ts and the generator that
 * writes src/device-presets-devtools.ts (which must not load the presets it is
 * about to generate).
 *
 * "iPhone 16 Pro" -> "iphone-16-pro", "Galaxy S9+" -> "galaxy-s9-plus",
 * "iPad (gen 7)" -> "ipad-gen-7".
 */
export function normalizeDeviceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\+/g, " plus")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
