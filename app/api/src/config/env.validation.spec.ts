import { validateEnvironment } from './env.validation';

const productionConfig = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://db.example.test/zaping',
  JWT_SECRET: 'j'.repeat(32),
  RESEND_API_KEY: 're_test_key',
  EMAIL_FROM: 'Zaping <no-reply@example.test>',
  FRONTEND_ORIGIN: 'https://app.example.test',
  FRONTEND_BASE_URL: 'https://app.example.test',
};

function validationError(config: Record<string, string | undefined>) {
  try {
    validateEnvironment(config);
    return undefined;
  } catch (error) {
    return error instanceof Error
      ? error
      : new Error('Unknown validation error');
  }
}

describe('environment configuration validation', () => {
  it('requires NODE_ENV explicitly', () => {
    const config = { ...productionConfig };
    delete config.NODE_ENV;

    const error = validationError(config);

    expect(error?.message).toContain('NODE_ENV');
  });

  it('rejects an invalid NODE_ENV', () => {
    const error = validationError({
      ...productionConfig,
      NODE_ENV: 'staging',
    });

    expect(error?.message).toContain('NODE_ENV');
  });

  it('accepts a valid development configuration with safe defaults', () => {
    const result = validateEnvironment({
      NODE_ENV: 'development',
      DATABASE_URL: productionConfig.DATABASE_URL,
      JWT_SECRET: productionConfig.JWT_SECRET,
    });

    expect(result.NODE_ENV).toBe('development');
    expect(result.FRONTEND_ORIGIN).toBe('http://localhost:3000');
    expect(result.FRONTEND_BASE_URL).toBe('http://localhost:3000');
    expect(result.PORT).toBe('3001');
    expect(result.TRUST_PROXY_HOPS).toBe('0');
  });

  it('accepts a valid test configuration with safe defaults', () => {
    const result = validateEnvironment({
      NODE_ENV: 'test',
      DATABASE_URL: productionConfig.DATABASE_URL,
      JWT_SECRET: productionConfig.JWT_SECRET,
    });

    expect(result.NODE_ENV).toBe('test');
    expect(result.FRONTEND_ORIGIN).toBe('http://localhost:3000');
    expect(result.FRONTEND_BASE_URL).toBe('http://localhost:3000');
  });

  it('requires a strong JWT secret', () => {
    const config = { ...productionConfig };
    delete config.JWT_SECRET;

    const error = validationError(config);

    expect(error).toBeDefined();
    expect(error?.message).toContain('JWT_SECRET');
    expect(error?.message).not.toContain(productionConfig.JWT_SECRET);
  });

  it('rejects weak JWT secrets', () => {
    const error = validationError({
      ...productionConfig,
      JWT_SECRET: 'too-short',
    });

    expect(error?.message).toContain('JWT_SECRET');
  });

  it('requires the database URL', () => {
    const config = { ...productionConfig };
    delete config.DATABASE_URL;

    const error = validationError(config);

    expect(error?.message).toContain('DATABASE_URL');
  });

  it('requires a production frontend origin', () => {
    const config = { ...productionConfig };
    delete config.FRONTEND_ORIGIN;

    const error = validationError(config);

    expect(error?.message).toContain('FRONTEND_ORIGIN');
  });

  it('rejects an HTTP production frontend origin', () => {
    const error = validationError({
      ...productionConfig,
      FRONTEND_ORIGIN: 'http://app.example.test',
    });

    expect(error?.message).toContain('FRONTEND_ORIGIN');
  });

  it('accepts a valid production configuration', () => {
    const result = validateEnvironment(productionConfig);

    expect(result).toMatchObject({
      NODE_ENV: 'production',
      FRONTEND_ORIGIN: 'https://app.example.test',
      FRONTEND_BASE_URL: 'https://app.example.test',
      PORT: '3001',
      TRUST_PROXY_HOPS: '0',
    });
  });

  it.each(['1', '8080', '65535'])('accepts valid PORT=%s', (port) => {
    const result = validateEnvironment({
      ...productionConfig,
      PORT: port,
    });

    expect(result.PORT).toBe(port);
  });

  it.each(['0', '-1', '65536', 'abc', '8080.5'])(
    'rejects invalid PORT=%s',
    (port) => {
      const error = validationError({
        ...productionConfig,
        PORT: port,
      });

      expect(error?.message).toContain('PORT');
    },
  );

  it.each(['0', '1', '2', '10'])(
    'accepts valid TRUST_PROXY_HOPS=%s',
    (hops) => {
      const result = validateEnvironment({
        ...productionConfig,
        TRUST_PROXY_HOPS: hops,
      });

      expect(result.TRUST_PROXY_HOPS).toBe(hops);
    },
  );

  it.each(['-1', '11', 'abc', '1.5'])(
    'rejects invalid TRUST_PROXY_HOPS=%s',
    (hops) => {
      const error = validationError({
        ...productionConfig,
        TRUST_PROXY_HOPS: hops,
      });

      expect(error?.message).toContain('TRUST_PROXY_HOPS');
    },
  );

  it('allows R2 to remain unconfigured during local ERP development', () => {
    const result = validateEnvironment({
      ...productionConfig,
      NODE_ENV: 'development',
    });
    expect(result.R2_ACCOUNT_ID).toBeUndefined();
  });

  it('rejects incomplete R2 configuration without leaking secrets', () => {
    const error = validationError({
      ...productionConfig,
      R2_ACCOUNT_ID: 'a'.repeat(32),
    });
    expect(error?.message).toContain('R2_BUCKET');
  });

  it('accepts bucket-scoped R2 credentials when fully supplied', () => {
    const result = validateEnvironment({
      ...productionConfig,
      R2_ACCOUNT_ID: 'a'.repeat(32),
      R2_BUCKET: 'zaping-files-local',
      R2_ACCESS_KEY_ID: 'example-key',
      R2_SECRET_ACCESS_KEY: 'example-secret',
    });
    expect(result.R2_BUCKET).toBe('zaping-files-local');
  });

  it('requires email settings in production', () => {
    const missingApiKey = { ...productionConfig };
    delete missingApiKey.RESEND_API_KEY;
    const missingFrom = { ...productionConfig };
    delete missingFrom.EMAIL_FROM;

    const apiKeyError = validationError(missingApiKey);
    const fromError = validationError(missingFrom);

    expect(apiKeyError?.message).toContain('RESEND_API_KEY');
    expect(fromError?.message).toContain('EMAIL_FROM');
  });
});
