import { Prisma } from '../generated/prisma/client.js';

const unavailablePrismaCodes = new Set([
  'P1000',
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
]);

export function isRecoverableWriteConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2034')
  );
}

export function isPersistenceUnavailable(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      unavailablePrismaCodes.has(error.code))
  ) {
    return true;
  }

  if (!(error instanceof Error) || !('code' in error)) {
    return false;
  }

  const code = error.code;
  return (
    typeof code === 'string' &&
    [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'EHOSTUNREACH',
      'ENETUNREACH',
      '57P01',
      '57P02',
      '57P03',
    ].includes(code)
  );
}
