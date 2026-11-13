const LOCAL_FRONTEND_URL = 'http://localhost:3000';
const DEFAULT_PORT = 3001;
const DEFAULT_TRUST_PROXY_HOPS = 0;

export type NodeEnvironment = 'development' | 'test' | 'production';
export type EnvironmentVariables = Record<string, string | undefined>;

function isNodeEnvironment(value: string): value is NodeEnvironment {
  return ['development', 'test', 'production'].includes(value);
}

function requiredValue(
  environment: EnvironmentVariables,
  name: string,
): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be defined`);
  }

  return value;
}

function parseOptionalInteger(
  value: string | undefined,
  name: string,
  minimum: number,
  maximum: number,
  defaultValue: number,
): number {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return defaultValue;
  }

  if (!/^\d+$/.test(normalizedValue)) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }

  const parsedValue = Number(normalizedValue);

  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < minimum ||
    parsedValue > maximum
  ) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }

  return parsedValue;
}

export function parsePort(value: string | undefined): number {
  return parseOptionalInteger(value, 'PORT', 1, 65535, DEFAULT_PORT);
}

export function parseTrustProxyHops(value: string | undefined): number {
  return parseOptionalInteger(
    value,
    'TRUST_PROXY_HOPS',
    0,
    10,
    DEFAULT_TRUST_PROXY_HOPS,
  );
}

function parseHttpUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);

    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function validateFrontendOrigin(
  value: string,
  nodeEnv: NodeEnvironment,
): string {
  const parsed = parseHttpUrl(value);

  if (!parsed || parsed.pathname !== '/') {
    throw new Error('FRONTEND_ORIGIN must be a valid HTTP(S) origin');
  }

  if (nodeEnv === 'production' && parsed.protocol !== 'https:') {
    throw new Error('FRONTEND_ORIGIN must use HTTPS in production');
  }

  return parsed.origin;
}

function validateFrontendBaseUrl(
  value: string,
  nodeEnv: NodeEnvironment,
): string {
  const parsed = parseHttpUrl(value);

  if (!parsed) {
    throw new Error('FRONTEND_BASE_URL must be a valid HTTP(S) URL');
  }

  if (nodeEnv === 'production' && parsed.protocol !== 'https:') {
    throw new Error('FRONTEND_BASE_URL must use HTTPS in production');
  }

  return value;
}

export function validateEnvironment(
  environment: EnvironmentVariables,
): EnvironmentVariables {
  const nodeEnvValue = requiredValue(environment, 'NODE_ENV');

  if (!isNodeEnvironment(nodeEnvValue)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  const nodeEnv = nodeEnvValue;

  const databaseUrl = requiredValue(environment, 'DATABASE_URL');
  const jwtSecret = requiredValue(environment, 'JWT_SECRET');
  const port = parsePort(environment.PORT);
  const trustProxyHops = parseTrustProxyHops(environment.TRUST_PROXY_HOPS);

  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }

  const frontendOriginValue =
    environment.FRONTEND_ORIGIN?.trim() ||
    (nodeEnv === 'production' ? '' : LOCAL_FRONTEND_URL);
  const frontendBaseUrlValue =
    environment.FRONTEND_BASE_URL?.trim() ||
    (nodeEnv === 'production' ? '' : LOCAL_FRONTEND_URL);
  const frontendOrigin = validateFrontendOrigin(
    requiredValue({ FRONTEND_ORIGIN: frontendOriginValue }, 'FRONTEND_ORIGIN'),
    nodeEnv,
  );
  const frontendBaseUrl = validateFrontendBaseUrl(
    requiredValue(
      { FRONTEND_BASE_URL: frontendBaseUrlValue },
      'FRONTEND_BASE_URL',
    ),
    nodeEnv,
  );

  const validatedEnvironment: EnvironmentVariables = {
    ...environment,
    NODE_ENV: nodeEnv,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    FRONTEND_ORIGIN: frontendOrigin,
    FRONTEND_BASE_URL: frontendBaseUrl,
    PORT: String(port),
    TRUST_PROXY_HOPS: String(trustProxyHops),
  };

  if (nodeEnv === 'production') {
    validatedEnvironment.RESEND_API_KEY = requiredValue(
      environment,
      'RESEND_API_KEY',
    );
    validatedEnvironment.EMAIL_FROM = requiredValue(environment, 'EMAIL_FROM');
  } else {
    if (environment.RESEND_API_KEY?.trim()) {
      validatedEnvironment.RESEND_API_KEY = environment.RESEND_API_KEY.trim();
    }

    if (environment.EMAIL_FROM?.trim()) {
      validatedEnvironment.EMAIL_FROM = environment.EMAIL_FROM.trim();
    }
  }

  const r2Settings = [
    'R2_ACCOUNT_ID',
    'R2_BUCKET',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
  ] as const;
  // R2 is optional until a developer enables the feature, but never partially configured.
  if (r2Settings.some((name) => Boolean(environment[name]?.trim()))) {
    for (const name of r2Settings) {
      validatedEnvironment[name] = requiredValue(environment, name);
    }
    if (!/^[a-f0-9]{32}$/i.test(validatedEnvironment.R2_ACCOUNT_ID!)) {
      throw new Error('R2_ACCOUNT_ID must be a 32-character hexadecimal account ID');
    }
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(validatedEnvironment.R2_BUCKET!)) {
      throw new Error('R2_BUCKET has an invalid name');
    }
  }

  return validatedEnvironment;
}
