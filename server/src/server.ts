import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createPrismaDatabaseClient } from './database/prisma-database-client.js';
import { SupabaseIdentityVerifier } from './identity/supabase-identity-verifier.js';
import { PrismaProjectService } from './projects/prisma-project-service.js';
import { PrismaIdentityProvisioner } from './provisioning/prisma-identity-provisioner.js';
import { S3ObjectStorage } from './storage/s3-object-storage.js';
import { PrismaSourceRepository } from './sources/prisma-source-repository.js';
import { DefaultSourceService } from './sources/source-service.js';
import { PrismaUploadIntentService } from './uploads/prisma-upload-intent-service.js';

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
const projectService =
  databaseClient === undefined
    ? undefined
    : new PrismaProjectService(databaseClient.prisma);
const uploadIntentService =
  databaseClient === undefined
    ? undefined
    : new PrismaUploadIntentService(databaseClient.prisma);
const sourceService =
  databaseClient === undefined
    ? undefined
    : new DefaultSourceService(
        new PrismaSourceRepository(databaseClient.prisma),
      );
const objectStorage =
  env.storageMode === 's3'
    ? new S3ObjectStorage({
        endpoint: env.s3Endpoint,
        region: env.s3Region,
        bucket: env.s3Bucket,
        accessKeyId: env.s3AccessKeyId,
        secretAccessKey: env.s3SecretAccessKey,
        forcePathStyle: env.s3ForcePathStyle,
      })
    : undefined;
const app = createApp({
  ...(identityVerifier === undefined ? {} : { identityVerifier }),
  ...(identityProvisioner === undefined ? {} : { identityProvisioner }),
  ...(projectService === undefined ? {} : { projectService }),
  ...(sourceService === undefined ? {} : { sourceService }),
  ...(uploadIntentService === undefined ? {} : { uploadIntentService }),
  ...(objectStorage === undefined ? {} : { objectStorage }),
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
