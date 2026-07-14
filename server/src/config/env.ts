const nodeEnvironments = ['development', 'test', 'production'] as const;
const authModes = ['disabled', 'supabase'] as const;
const storageModes = ['disabled', 's3'] as const;

export type NodeEnvironment = (typeof nodeEnvironments)[number];
export type AuthMode = (typeof authModes)[number];
export type StorageMode = (typeof storageModes)[number];

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

export interface DisabledStorageEnvConfig {
  readonly storageMode: 'disabled';
}

export interface S3StorageEnvConfig {
  readonly storageMode: 's3';
  readonly s3Endpoint: string;
  readonly s3Region: string;
  readonly s3Bucket: string;
  readonly s3AccessKeyId: string;
  readonly s3SecretAccessKey: string;
  readonly s3ForcePathStyle: boolean;
}

export type StorageEnvConfig = DisabledStorageEnvConfig | S3StorageEnvConfig;

export type EnvConfig = (DisabledAuthEnvConfig | SupabaseAuthEnvConfig) &
  StorageEnvConfig;

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

function parseStorageMode(
  value: string | undefined,
  nodeEnvironment: NodeEnvironment,
): StorageMode {
  const candidate = value ?? 'disabled';

  if (!storageModes.includes(candidate as StorageMode)) {
    throw new Error(
      `Invalid STORAGE_MODE: expected one of ${storageModes.join(', ')}.`,
    );
  }

  if (candidate === 'disabled' && nodeEnvironment === 'production') {
    throw new Error(
      'Invalid STORAGE_MODE: object storage cannot be disabled in production.',
    );
  }

  return candidate as StorageMode;
}

function parseS3Endpoint(
  value: string | undefined,
  nodeEnvironment: NodeEnvironment,
): string {
  if (value === undefined || value.length === 0) {
    throw new Error(
      'Missing S3_ENDPOINT: an object storage endpoint is required.',
    );
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid S3_ENDPOINT: expected an HTTP or HTTPS URL.');
  }

  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  const isAllowedHttp =
    url.protocol === 'http:' &&
    nodeEnvironment !== 'production' &&
    loopbackHosts.has(url.hostname);

  if (
    (url.protocol !== 'https:' && !isAllowedHttp) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error(
      'Invalid S3_ENDPOINT: expected HTTPS without credentials, query, or fragment; loopback HTTP is allowed only outside production.',
    );
  }

  return url.toString().replace(/\/+$/, '');
}

function parseRequiredValue(
  name: string,
  value: string | undefined,
  maximumLength: number,
): string {
  if (
    value === undefined ||
    value.length === 0 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    /\s/.test(value)
  ) {
    throw new Error(`Invalid ${name}: expected a non-empty value.`);
  }

  return value;
}

function parseS3Bucket(value: string | undefined): string {
  const bucket = parseRequiredValue('S3_BUCKET', value, 63);

  if (
    bucket.length < 3 ||
    !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket) ||
    bucket.includes('..') ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(bucket)
  ) {
    throw new Error('Invalid S3_BUCKET: expected a valid private bucket name.');
  }

  return bucket;
}

function parseStrictBoolean(name: string, value: string | undefined): boolean {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error(`Invalid ${name}: expected true or false.`);
}

function parseStorageConfig(
  environment: NodeJS.ProcessEnv,
  nodeEnvironment: NodeEnvironment,
): StorageEnvConfig {
  const storageMode = parseStorageMode(
    environment.STORAGE_MODE,
    nodeEnvironment,
  );

  if (storageMode === 'disabled') {
    return { storageMode };
  }

  return {
    storageMode,
    s3Endpoint: parseS3Endpoint(environment.S3_ENDPOINT, nodeEnvironment),
    s3Region: parseRequiredValue('S3_REGION', environment.S3_REGION, 100),
    s3Bucket: parseS3Bucket(environment.S3_BUCKET),
    s3AccessKeyId: parseRequiredValue(
      'S3_ACCESS_KEY_ID',
      environment.S3_ACCESS_KEY_ID,
      255,
    ),
    s3SecretAccessKey: parseRequiredValue(
      'S3_SECRET_ACCESS_KEY',
      environment.S3_SECRET_ACCESS_KEY,
      255,
    ),
    s3ForcePathStyle: parseStrictBoolean(
      'S3_FORCE_PATH_STYLE',
      environment.S3_FORCE_PATH_STYLE,
    ),
  };
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
  const storageConfig = parseStorageConfig(environment, nodeEnv);
  const databaseConfig = databaseUrl === undefined ? {} : { databaseUrl };

  if (authMode === 'supabase') {
    return {
      nodeEnv,
      port,
      authMode,
      supabaseUrl: parseSupabaseUrl(environment.SUPABASE_URL),
      supabaseJwtAudience,
      ...storageConfig,
      ...databaseConfig,
    };
  }

  return {
    nodeEnv,
    port,
    authMode,
    supabaseJwtAudience,
    ...storageConfig,
    ...databaseConfig,
  };
}
