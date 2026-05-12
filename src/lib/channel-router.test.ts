/**
 * Channel router env-override tests.
 *
 * Proves the three-layer priority order:
 *   env override → DB channel_config → DEFAULT_CHANNELS → null
 *
 * DB layer is not exercised here (requires a live connection). When the DB
 * refresh call fails because no DATABASE_URL / no connectivity, the router
 * swallows the error and leaves its cache null — which is exactly what we
 * want: the env-override and DEFAULT_CHANNELS paths still work.
 *
 * Run with: `pnpm test:channel-router`
 */

import { getActiveChannel } from './channel-router';

const failures: string[] = [];
const passes: string[] = [];

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passes.push(name);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`${name}\n    ${message.split('\n').join('\n    ')}`);
  }
}

function clearVendorEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('IMAGE_VENDOR__')) {
      delete process.env[key];
    }
  }
}

async function main(): Promise<void> {
  await check(
    'no env set → falls through to DEFAULT_CHANNELS (nano-banana → maxapi)',
    async () => {
      clearVendorEnv();
      const result = await getActiveChannel(
        'nano-banana',
        'text-to-image',
        'pro'
      );
      if (!result || result.channel !== 'maxapi') {
        throw new Error(
          `expected { channel: 'maxapi' }, got ${JSON.stringify(result)}`
        );
      }
    }
  );

  await check(
    'version-specific env override wins over DEFAULT_CHANNELS',
    async () => {
      clearVendorEnv();
      process.env.IMAGE_VENDOR__NANO_BANANA_PRO = 'kie';
      const result = await getActiveChannel(
        'nano-banana',
        'text-to-image',
        'pro'
      );
      if (!result || result.channel !== 'kie') {
        throw new Error(
          `expected { channel: 'kie' }, got ${JSON.stringify(result)}`
        );
      }
    }
  );

  await check('family-level env override applies to any version', async () => {
    clearVendorEnv();
    process.env.IMAGE_VENDOR__NANO_BANANA = 'apimart';
    const result = await getActiveChannel(
      'nano-banana',
      'text-to-image',
      'edit'
    );
    if (!result || result.channel !== 'apimart') {
      throw new Error(
        `expected { channel: 'apimart' }, got ${JSON.stringify(result)}`
      );
    }
  });

  await check(
    'version env wins when both version and family env are set',
    async () => {
      clearVendorEnv();
      process.env.IMAGE_VENDOR__NANO_BANANA = 'apimart';
      process.env.IMAGE_VENDOR__NANO_BANANA_PRO = 'kie';
      const result = await getActiveChannel(
        'nano-banana',
        'text-to-image',
        'pro'
      );
      if (!result || result.channel !== 'kie') {
        throw new Error(
          `expected { channel: 'kie' } (version wins), got ${JSON.stringify(result)}`
        );
      }
    }
  );

  await check(
    'empty env value is treated as unset — falls through to default',
    async () => {
      clearVendorEnv();
      process.env.IMAGE_VENDOR__NANO_BANANA_PRO = '';
      const result = await getActiveChannel(
        'nano-banana',
        'text-to-image',
        'pro'
      );
      if (!result || result.channel !== 'maxapi') {
        throw new Error(
          `expected fall-through to 'maxapi', got ${JSON.stringify(result)}`
        );
      }
    }
  );

  await check(
    'env key name escaping: gpt-image:2 → IMAGE_VENDOR__GPT_IMAGE_2',
    async () => {
      clearVendorEnv();
      process.env.IMAGE_VENDOR__GPT_IMAGE_2 = 'maxapi';
      const result = await getActiveChannel('gpt-image', 'text-to-image', '2');
      if (!result || result.channel !== 'maxapi') {
        throw new Error(
          `expected { channel: 'maxapi' }, got ${JSON.stringify(result)}`
        );
      }
    }
  );

  await check(
    'dotted version escapes: wan:2.6 → IMAGE_VENDOR__WAN_2_6',
    async () => {
      clearVendorEnv();
      process.env.IMAGE_VENDOR__WAN_2_6 = 'apimart';
      const result = await getActiveChannel('wan', 'text-to-video', '2.6');
      if (!result || result.channel !== 'apimart') {
        throw new Error(
          `expected { channel: 'apimart' }, got ${JSON.stringify(result)}`
        );
      }
    }
  );

  // Report
  console.log(`\n${passes.length} passed, ${failures.length} failed\n`);
  if (failures.length > 0) {
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  for (const p of passes) console.log(`  ✓ ${p}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
