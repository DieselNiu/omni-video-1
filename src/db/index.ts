/**
 * Connect to PostgreSQL Database (Supabase/Neon/Local PostgreSQL)
 * https://orm.drizzle.team/docs/tutorials/drizzle-with-supabase
 */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

type DatabaseClient = Sql<Record<string, unknown>>;
type DatabaseInstance = PostgresJsDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __gptimage2Db__: DatabaseInstance | undefined;
  // eslint-disable-next-line no-var
  var __gptimage2DbClient__: DatabaseClient | undefined;
}

export async function getDb() {
  if (globalThis.__gptimage2Db__) {
    return globalThis.__gptimage2Db__;
  }

  const connectionString = process.env.DATABASE_URL!;
  const client =
    globalThis.__gptimage2DbClient__ ||
    postgres(connectionString, {
      prepare: false,
    });
  const db = globalThis.__gptimage2Db__ || drizzle(client, { schema });

  globalThis.__gptimage2DbClient__ = client;
  globalThis.__gptimage2Db__ = db;

  return db;
}

/**
 * Connect to Neon Database
 * https://orm.drizzle.team/docs/tutorials/drizzle-with-neon
 */
// import { drizzle } from 'drizzle-orm/neon-http';
// const db = drizzle(process.env.DATABASE_URL!);

/**
 * Database connection with Drizzle
 * https://orm.drizzle.team/docs/connect-overview
 *
 * Drizzle <> PostgreSQL
 * https://orm.drizzle.team/docs/get-started-postgresql
 *
 * Get Started with Drizzle and Neon
 * https://orm.drizzle.team/docs/get-started/neon-new
 *
 * Drizzle with Neon Postgres
 * https://orm.drizzle.team/docs/tutorials/drizzle-with-neon
 *
 * Drizzle <> Neon Postgres
 * https://orm.drizzle.team/docs/connect-neon
 *
 * Drizzle with Supabase Database
 * https://orm.drizzle.team/docs/tutorials/drizzle-with-supabase
 */
