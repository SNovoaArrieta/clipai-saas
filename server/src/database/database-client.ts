import type { PrismaClient } from '../generated/prisma/client.js';

export interface DatabaseClient {
  readonly prisma: PrismaClient;
  close(): Promise<void>;
}
