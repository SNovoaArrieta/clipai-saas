import type { PrismaClient } from '../generated/prisma/client.js';
import type { AuthenticatedIdentity } from '../identity/authenticated-identity.js';
import {
  isPersistenceUnavailable,
  isRecoverableWriteConflict,
} from '../database/database-errors.js';
import {
  IdentityProvisioningError,
  type IdentityProvisioner,
  type ProvisionedIdentity,
} from './identity-provisioner.js';

const maximumAttempts = 2;

export class PrismaIdentityProvisioner implements IdentityProvisioner {
  public constructor(private readonly prisma: PrismaClient) {}

  public async provision(
    identity: AuthenticatedIdentity,
  ): Promise<ProvisionedIdentity> {
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const user = await transaction.user.upsert({
            where: { authSubject: identity.authSubject },
            create:
              identity.email === undefined
                ? { authSubject: identity.authSubject }
                : {
                    authSubject: identity.authSubject,
                    email: identity.email,
                  },
            update:
              identity.email === undefined ? {} : { email: identity.email },
            select: { id: true, email: true },
          });
          const workspace = await transaction.workspace.upsert({
            where: { ownerUserId: user.id },
            create: { ownerUserId: user.id },
            update: {},
            select: { id: true },
          });

          return {
            user:
              user.email === null
                ? { id: user.id }
                : { id: user.id, email: user.email },
            workspace,
          };
        });
      } catch (error: unknown) {
        if (attempt < maximumAttempts && isRecoverableWriteConflict(error)) {
          continue;
        }

        throw new IdentityProvisioningError(
          isPersistenceUnavailable(error) ? 'unavailable' : 'internal',
        );
      }
    }

    throw new IdentityProvisioningError('internal');
  }
}
