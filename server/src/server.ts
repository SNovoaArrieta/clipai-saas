import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createPrismaDatabaseClient } from './database/prisma-database-client.js';
import { SupabaseIdentityVerifier } from './identity/supabase-identity-verifier.js';
import { PrismaIdentityProvisioner } from './provisioning/prisma-identity-provisioner.js';

const env = loadEnv();
const identityVerifier =
  env.authMode === 'supabase'
    ? new SupabaseIdentityVerifier({
        supabaseUrl: env.supabaseUrl,
        audience: env.supabaseJwtAudience,
      })
    : undefined;
const databaseClient =
  env.databaseUrl === undefined
    ? undefined
    : createPrismaDatabaseClient(env.databaseUrl);
const identityProvisioner =
  databaseClient === undefined
    ? undefined
    : new PrismaIdentityProvisioner(databaseClient.prisma);
const app = createApp({
  ...(identityVerifier === undefined ? {} : { identityVerifier }),
  ...(identityProvisioner === undefined ? {} : { identityProvisioner }),
});

const httpServer = app.listen(env.port, () => {
  console.log(`Server listening on port ${env.port} in ${env.nodeEnv} mode.`);
});

let shutdownPromise: Promise<void> | undefined;

function closeHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error === undefined) {
        resolve();
        return;
      }

      reject(error);
    });
  });
}

function shutdown(): Promise<void> {
  shutdownPromise ??= (async () => {
    let failed = false;

    try {
      await closeHttpServer();
    } catch {
      failed = true;
    }

    try {
      await databaseClient?.close();
    } catch {
      failed = true;
    }

    if (failed) {
      process.exitCode = 1;
    }
  })();

  return shutdownPromise;
}

process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
