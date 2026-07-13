const nodeEnvironments = ['development', 'test', 'production'] as const;
const authModes = ['disabled', 'supabase'] as const;

export type NodeEnvironment = (typeof nodeEnvironments)[number];
export type AuthMode = (typeof authModes)[number];

interface BaseEnvConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly port: number;
  readonly supabaseJwtAudience: string;
  readonly databaseUrl?: string;
}

export interface DisabledAuthEnvConfig extends BaseEnvConfig {
  readonly authMode: 'disabled';
}

export interface SupabaseAuthEnvConfig extends BaseEnvConfig {
  readonly authMode: 'supabase';
  readonly supabaseUrl: string;
}

export type EnvConfig = DisabledAuthEnvConfig | SupabaseAuthEnvConfig;

function parseNodeEnvironment(value: string | undefined): NodeEnvironment {
  const candidate = value ?? 'development';

  if (!nodeEnvironments.includes(candidate as NodeEnvironment)) {
    throw new Error(
      `Invalid NODE_ENV: expected one of ${nodeEnvironments.join(', ')}.`,
    );
  }

  return candidate as NodeEnvironment;
}

function parsePort(
  value: string | undefined,
  nodeEnvironment: NodeEnvironment,
): number {
  if (value === undefined && nodeEnvironment === 'production') {
    throw new Error(
      'Missing PORT: an explicit value is required in production.',
    );
  }

  const candidate = value ?? '3000';
  const port = Number(candidate);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Invalid PORT: expected an integer from 1 to 65535.');
  }

  return port;
}

function parseAuthMode(
  value: string | undefined,
  nodeEnvironment: NodeEnvironment,
): AuthMode {
  const candidate = value ?? 'disabled';

  if (!authModes.includes(candidate as AuthMode)) {
    throw new Error(
      `Invalid AUTH_MODE: expected one of ${authModes.join(', ')}.`,
    );
  }

  if (candidate === 'disabled' && nodeEnvironment === 'production') {
    throw new Error(
      'Invalid AUTH_MODE: authentication cannot be disabled in production.',
    );
  }

  return candidate as AuthMode;
}

function parseSupabaseUrl(value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    throw new Error('Missing SUPABASE_URL: an HTTPS project URL is required.');
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid SUPABASE_URL: expected an HTTPS project URL.');
  }

  if (
    url.protocol !== 'https:' ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'Invalid SUPABASE_URL: expected an HTTPS origin without credentials, path, query, or fragment.',
    );
  }

  return url.origin;
}

function parseAudience(value: string | undefined): string {
  const candidate = value ?? 'authenticated';

  if (
    candidate.length === 0 ||
    candidate.length > 128 ||
    candidate.trim() !== candidate ||
    /\s/.test(candidate)
  ) {
    throw new Error(
      'Invalid SUPABASE_JWT_AUDIENCE: expected a non-empty value.',
    );
  }

  return candidate;
}

function parseDatabaseUrl(
  value: string | undefined,
  nodeEnvironment: NodeEnvironment,
): string | undefined {
  if (value === undefined || value.length === 0) {
    if (nodeEnvironment === 'production') {
      throw new Error(
        'Missing DATABASE_URL: PostgreSQL persistence is required in production.',
      );
    }

    return undefined;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid DATABASE_URL: expected a PostgreSQL URL.');
  }

  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname.length === 0 ||
    url.pathname.length <= 1 ||
    url.hash.length > 0
  ) {
    throw new Error('Invalid DATABASE_URL: expected a PostgreSQL URL.');
  }

  return value;
}

export function loadEnv(
  environment: NodeJS.ProcessEnv = process.env,
): EnvConfig {
  const nodeEnv = parseNodeEnvironment(environment.NODE_ENV);
  const authMode = parseAuthMode(environment.AUTH_MODE, nodeEnv);
  const port = parsePort(environment.PORT, nodeEnv);
  const supabaseJwtAudience = parseAudience(environment.SUPABASE_JWT_AUDIENCE);
  const databaseUrl = parseDatabaseUrl(environment.DATABASE_URL, nodeEnv);
  const databaseConfig = databaseUrl === undefined ? {} : { databaseUrl };

  if (authMode === 'supabase') {
    return {
      nodeEnv,
      port,
      authMode,
      supabaseUrl: parseSupabaseUrl(environment.SUPABASE_URL),
      supabaseJwtAudience,
      ...databaseConfig,
    };
  }

  return {
    nodeEnv,
    port,
    authMode,
    supabaseJwtAudience,
    ...databaseConfig,
  };
}
