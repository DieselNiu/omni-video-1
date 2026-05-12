/**
 * Registry equivalence tests.
 *
 * Proves that `deriveImageModels(IMAGE_PRODUCTS, IMAGE_EXECUTABLES)` reproduces
 * the legacy IMAGE_MODELS record byte-for-byte. This is the guardrail behind
 * the Phase 1 "zero behavior change" claim — if this file fails, do NOT ship
 * the registry cutover.
 *
 * Run with: `pnpm test:registry`
 *
 * Intentionally standalone (no vitest / jest) because gptimage2 does not have
 * a configured test runner. Deep-equal comparison via node:assert/strict,
 * invoked via tsx. Phase 4 migrates this into a proper test framework if one
 * is added to the project.
 */

import { deepStrictEqual } from 'node:assert/strict';
import { IMAGE_MODELS as LEGACY_IMAGE_MODELS } from '../image/config/image-models';
import { deriveImageModels } from './derive';
import { IMAGE_EXECUTABLES, IMAGE_PRODUCTS } from './image-models';
import { MODEL_REGISTRY } from './registry';

const failures: string[] = [];
const passes: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passes.push(name);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`${name}\n    ${message.split('\n').join('\n    ')}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Registry boots without validator errors (constructor already threw if
//    something is wrong; reaching this import means we're fine).
// ---------------------------------------------------------------------------

check('registry constructs without validation errors', () => {
  const result = MODEL_REGISTRY.validate();
  deepStrictEqual(result.errors, []);
});

// ---------------------------------------------------------------------------
// 2. Byte-for-byte equivalence: every legacy entry reproduced.
// ---------------------------------------------------------------------------

const derived = deriveImageModels(IMAGE_PRODUCTS, IMAGE_EXECUTABLES);

for (const [legacyId, legacyConfig] of Object.entries(LEGACY_IMAGE_MODELS)) {
  check(
    `derived['${legacyId}'] deep-equals legacy IMAGE_MODELS['${legacyId}']`,
    () => {
      const derivedEntry = derived[legacyId];
      if (!derivedEntry) {
        throw new Error(`missing derived entry for "${legacyId}"`);
      }
      deepStrictEqual(derivedEntry, legacyConfig);
    }
  );
}

// ---------------------------------------------------------------------------
// 3. No spurious entries — derived must not introduce ids the legacy had none
//    of (otherwise a downstream `Object.keys(IMAGE_MODELS)` iteration would
//    observe behavior change).
// ---------------------------------------------------------------------------

check('derived output has same id set as legacy', () => {
  const legacyIds = Object.keys(LEGACY_IMAGE_MODELS).sort();
  const derivedIds = Object.keys(derived).sort();
  deepStrictEqual(derivedIds, legacyIds);
});

// ---------------------------------------------------------------------------
// 4. Registry surface smoke checks — resolve/getProductById round-trips work
//    for every legacy id, proving Phase 2 read-path cutover is safe.
// ---------------------------------------------------------------------------

for (const legacyId of Object.keys(LEGACY_IMAGE_MODELS)) {
  check(`registry.resolve('${legacyId}') returns a product+executable`, () => {
    const result = MODEL_REGISTRY.resolve(legacyId);
    if (result.externalModelId !== legacyId) {
      throw new Error(
        `externalModelId mismatch: got "${result.externalModelId}", want "${legacyId}"`
      );
    }
    if (!result.executable) {
      throw new Error('executable is null');
    }
  });
}

// ---------------------------------------------------------------------------
// 5. `gpt-image-2` is the public product; legacy `nano-banana-pro` stays
//    in the registry as an internal product to serve historical rows.
// ---------------------------------------------------------------------------

check('gpt-image-2 product exists and is public', () => {
  const product = MODEL_REGISTRY.getProductById('gpt-image-2');
  if (!product) throw new Error('gpt-image-2 product not registered');
  if (product.visibility !== 'public') {
    throw new Error(
      `gpt-image-2 visibility should be 'public', got '${product.visibility}'`
    );
  }
});

check('gpt-image-2 resolves to apimart executable', () => {
  const result = MODEL_REGISTRY.resolve('gpt-image-2');
  if (result.executable.id !== 'gpt-image-2-apimart') {
    throw new Error(
      `expected executable 'gpt-image-2-apimart', got '${result.executable.id}'`
    );
  }
  if (result.executable.binding.provider !== 'apimart') {
    throw new Error(
      `expected provider 'apimart', got '${result.executable.binding.provider}'`
    );
  }
});

check('legacy nano-banana-pro product is hidden but still resolvable', () => {
  const product = MODEL_REGISTRY.getProductById('nano-banana-pro');
  if (!product) throw new Error('nano-banana-pro product not registered');
  if (product.visibility !== 'internal') {
    throw new Error(
      `nano-banana-pro should be 'internal' now that gpt-image-2 is public, got '${product.visibility}'`
    );
  }
  const result = MODEL_REGISTRY.resolve('nano-banana-pro');
  if (result.executable.binding.provider !== 'maxapi') {
    throw new Error(
      `nano-banana-pro legacy routing should still reach maxapi, got '${result.executable.binding.provider}'`
    );
  }
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\n${passes.length} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
for (const p of passes) console.log(`  ✓ ${p}`);
