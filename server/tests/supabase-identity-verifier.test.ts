import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { IdentityVerificationError } from '../src/identity/identity-verifier.js';
import { SupabaseIdentityVerifier } from '../src/identity/supabase-identity-verifier.js';

const supabaseUrl = 'https://project.supabase.co';
const issuer = `${supabaseUrl}/auth/v1`;
const audience = 'authenticated';
const keyId = 'local-test-key';
const validSubject = '123e4567-e89b-42d3-a456-426614174000';

let privateKey: CryptoKey;
let wrongPrivateKey: CryptoKey;
let keyResolver: JWTVerifyGetKey;

async function signToken(
  options: {
    privateSigningKey?: CryptoKey;
    tokenIssuer?: string;
    tokenAudience?: string;
    subject?: string;
    email?: string;
    role?: unknown;
    omitRole?: boolean;
    expired?: boolean;
  } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  let token = new SignJWT({
    ...(options.email === undefined ? {} : { email: options.email }),
    ...(options.omitRole === true
      ? {}
      : { role: options.role ?? 'authenticated' }),
  })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setIssuer(options.tokenIssuer ?? issuer)
    .setAudience(options.tokenAudience ?? audience)
    .setIssuedAt(now - 5)
    .setExpirationTime(options.expired === true ? now - 1 : now + 300);

  if (options.subject !== undefined) {
    token = token.setSubject(options.subject);
  }

  return token.sign(options.privateSigningKey ?? privateKey);
}

beforeAll(async () => {
  const validKeyPair = await generateKeyPair('RS256');
  const wrongKeyPair = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(validKeyPair.publicKey);
  publicJwk.alg = 'RS256';
  publicJwk.kid = keyId;
  publicJwk.use = 'sig';

  privateKey = validKeyPair.privateKey;
  wrongPrivateKey = wrongKeyPair.privateKey;
  keyResolver = createLocalJWKSet({
    keys: [publicJwk],
  } satisfies JSONWebKeySet);
});

function createVerifier(resolver: JWTVerifyGetKey = keyResolver) {
  return new SupabaseIdentityVerifier({
    supabaseUrl,
    audience,
    keyResolver: resolver,
  });
}

async function expectInvalid(token: string): Promise<void> {
  await expect(createVerifier().verifyAccessToken(token)).rejects.toMatchObject(
    {
      failure: 'invalid',
    },
  );
}

describe('SupabaseIdentityVerifier', () => {
  it('verifies a correctly signed token and projects allowed claims', async () => {
    const token = await signToken({
      subject: validSubject,
      email: 'user@example.com',
    });

    await expect(createVerifier().verifyAccessToken(token)).resolves.toEqual({
      authSubject: validSubject,
      email: 'user@example.com',
    });
  });

  it('omits an invalid optional email claim', async () => {
    const token = await signToken({
      subject: validSubject,
      email: 'not-an-email',
    });

    await expect(createVerifier().verifyAccessToken(token)).resolves.toEqual({
      authSubject: validSubject,
    });
  });

  it('rejects a token with an invalid signature', async () => {
    await expectInvalid(
      await signToken({
        subject: validSubject,
        privateSigningKey: wrongPrivateKey,
      }),
    );
  });

  it('rejects an incorrect issuer', async () => {
    await expectInvalid(
      await signToken({
        subject: validSubject,
        tokenIssuer: 'https://other-project.supabase.co/auth/v1',
      }),
    );
  });

  it('rejects an incorrect audience', async () => {
    await expectInvalid(
      await signToken({
        subject: validSubject,
        tokenAudience: 'other-audience',
      }),
    );
  });

  it('rejects an expired token', async () => {
    await expectInvalid(
      await signToken({ subject: validSubject, expired: true }),
    );
  });

  it('accepts role authenticated', async () => {
    await expect(
      createVerifier().verifyAccessToken(
        await signToken({ subject: validSubject, role: 'authenticated' }),
      ),
    ).resolves.toMatchObject({ authSubject: validSubject });
  });

  it.each([
    ['anon', 'anon'],
    ['service_role', 'service_role'],
    ['an empty string', ''],
    ['a non-string value', 42],
  ])('rejects role %s', async (_case, role) => {
    await expectInvalid(await signToken({ subject: validSubject, role }));
  });

  it('rejects a token without role', async () => {
    await expectInvalid(
      await signToken({ subject: validSubject, omitRole: true }),
    );
  });

  it('rejects an empty sub', async () => {
    await expectInvalid(await signToken({ subject: '' }));
  });

  it('rejects a non-UUID sub', async () => {
    await expectInvalid(await signToken({ subject: 'not-a-uuid' }));
  });

  it('rejects a token without sub', async () => {
    await expectInvalid(await signToken());
  });

  it('preserves a temporary key-resolution failure internally', async () => {
    const unavailableResolver: JWTVerifyGetKey = async () => {
      throw new IdentityVerificationError('unavailable');
    };
    const token = await signToken({ subject: validSubject });

    await expect(
      createVerifier(unavailableResolver).verifyAccessToken(token),
    ).rejects.toMatchObject({ failure: 'unavailable' });
  });
});
