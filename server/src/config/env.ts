const nodeEnvironments = ['development', 'test', 'production'] as const;

export type NodeEnvironment = (typeof nodeEnvironments)[number];

export interface EnvConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly port: number;
}

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

export function loadEnv(
  environment: NodeJS.ProcessEnv = process.env,
): EnvConfig {
  const nodeEnv = parseNodeEnvironment(environment.NODE_ENV);

  return {
    nodeEnv,
    port: parsePort(environment.PORT, nodeEnv),
  };
}
