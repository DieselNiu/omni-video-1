import { loadEnvConfig } from '@next/env';
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/index.js';
import { user } from '../src/db/schema.js';

loadEnvConfig(process.cwd());

const TARGET = process.argv[2] ?? '3pjv2O5kXLO6mNWSr2vPvUEXl8vmMvEH';

async function makeAdmin() {
  const db = await getDb();
  const isEmail = TARGET.includes('@');

  const updated = await db
    .update(user)
    .set({ role: 'admin' })
    .where(isEmail ? eq(user.email, TARGET) : eq(user.id, TARGET))
    .returning({ id: user.id, email: user.email, role: user.role });

  if (updated.length === 0) {
    console.error(`No user found matching: ${TARGET}`);
    process.exit(1);
  }
  console.log('Updated:', updated);
}

makeAdmin().catch((e) => {
  console.error(e);
  process.exit(1);
});
