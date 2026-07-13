export const MAX_BEARER_TOKEN_LENGTH = 8_192;

export class BearerTokenError extends Error {
  public constructor(public readonly reason: 'missing' | 'malformed') {
    super('Bearer token extraction failed');
    this.name = 'BearerTokenError';
  }
}

export function extractBearerToken(
  authorizationValues: readonly string[] | undefined,
): string {
  if (authorizationValues === undefined || authorizationValues.length === 0) {
    throw new BearerTokenError('missing');
  }

  if (authorizationValues.length !== 1) {
    throw new BearerTokenError('malformed');
  }

  const authorization = authorizationValues[0];
  const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? '');

  if (match === null) {
    throw new BearerTokenError('malformed');
  }

  const token = match[1];

  if (token === undefined || token.length > MAX_BEARER_TOKEN_LENGTH) {
    throw new BearerTokenError('malformed');
  }

  return token;
}
