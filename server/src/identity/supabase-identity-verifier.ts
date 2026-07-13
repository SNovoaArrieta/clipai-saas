import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';

import type { AuthenticatedIdentity } from './authenticated-identity.js';
import {
  IdentityVerificationError,
  type IdentityVerifier,
} from './identity-verifier.js';

const asymmetricAlgorithms = ['ES256', 'RS256'];
const supabaseSubjectPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const remoteJwksOptions = {
  timeoutDuration: 5_000,
  cooldownDuration: 30_000,
  cacheMaxAge: 600_000,
} as const;

export interface SupabaseIdentityVerifierOptions {
  readonly supabaseUrl: string;
  readonly audience: string;
  readonly keyResolver?: JWTVerifyGetKey;
}

function createSupabaseRemoteKeyResolver(jwksUrl: URL): JWTVerifyGetKey {
  const remoteKeyResolver = createRemoteJWKSet(jwksUrl, remoteJwksOptions);

  return async (protectedHeader, token) => {
    try {
      return await remoteKeyResolver(protectedHeader, token);
    } catch (error: unknown) {
      if (
        error instanceof errors.JWKSNoMatchingKey ||
        error instanceof errors.JWKSMultipleMatchingKeys
      ) {
        throw error;
      }

      throw new IdentityVerificationError('unavailable');
    }
  };
}

function readEmail(payload: JWTPayload): string | undefined {
  const email = payload.email;

  if (
    typeof email !== 'string' ||
    email.length > 254 ||
    email.trim() !== email ||
    !/^[^\s@]{1,64}@[^\s@]{1,189}$/.test(email)
  ) {
    return undefined;
  }

  return email;
}

function toAuthenticatedIdentity(payload: JWTPayload): AuthenticatedIdentity {
  if (
    typeof payload.sub !== 'string' ||
    !supabaseSubjectPattern.test(payload.sub) ||
    payload.role !== 'authenticated'
  ) {
    throw new IdentityVerificationError('invalid');
  }

  const email = readEmail(payload);

  return email === undefined
    ? { authSubject: payload.sub }
    : { authSubject: payload.sub, email };
}

export class SupabaseIdentityVerifier implements IdentityVerifier {
  readonly #audience: string;
  readonly #issuer: string;
  readonly #keyResolver: JWTVerifyGetKey;

  public constructor(options: SupabaseIdentityVerifierOptions) {
    this.#audience = options.audience;
    this.#issuer = `${options.supabaseUrl}/auth/v1`;
    this.#keyResolver =
      options.keyResolver ??
      createSupabaseRemoteKeyResolver(
        new URL(`${this.#issuer}/.well-known/jwks.json`),
      );
  }

  public async verifyAccessToken(
    token: string,
  ): Promise<AuthenticatedIdentity> {
    try {
      const { payload } = await jwtVerify(token, this.#keyResolver, {
        algorithms: asymmetricAlgorithms,
        issuer: this.#issuer,
        audience: this.#audience,
        requiredClaims: ['sub', 'role', 'exp', 'iat'],
      });

      return toAuthenticatedIdentity(payload);
    } catch (error: unknown) {
      if (error instanceof IdentityVerificationError) {
        throw error;
      }

      throw new IdentityVerificationError('invalid');
    }
  }
}
