import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient } from '../generated/prisma/client.js';
import type { DatabaseClient } from './database-client.js';

const maximumPoolConnections = 5;
const connectionTimeoutMilliseconds = 5_000;
const idleTimeoutMilliseconds = 30_000;

export function createPrismaDatabaseClient(
  connectionString: string,
): DatabaseClient {
  const pool = new Pool({
    connectionString,
    max: maximumPoolConnections,
    connectionTimeoutMillis: connectionTimeoutMilliseconds,
    idleTimeoutMillis: idleTimeoutMilliseconds,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  let closePromise: Promise<void> | undefined;

  return {
    prisma,
    close() {
      closePromise ??= (async () => {
        try {
          await prisma.$disconnect();
        } finally {
          await pool.end();
        }
      })();

      return closePromise;
    },
  };
}
