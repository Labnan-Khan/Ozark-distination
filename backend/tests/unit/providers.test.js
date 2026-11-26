import { describe, expect, it } from '@jest/globals';
import { env } from '../../src/config/environment.js';
import { emailProvider } from '../../src/infrastructure/email/index.js';
import { storageProvider } from '../../src/infrastructure/storage/index.js';

describe('provider selection', () => {
  it('selects the email provider named by EMAIL_PROVIDER', () => {
    const expected = env.EMAIL_PROVIDER === 'smtp' ? 'SmtpEmailProvider' : 'ConsoleEmailProvider';

    expect(['console', 'smtp']).toContain(env.EMAIL_PROVIDER);
    expect(env.EMAIL_PROVIDER).toBe(process.env.EMAIL_PROVIDER);
    expect(emailProvider.constructor.name).toBe(expected);
  });

  it('selects the storage provider named by STORAGE_PROVIDER', () => {
    const expected = env.STORAGE_PROVIDER === 'cloudinary' ? 'CloudinaryStorageProvider' : 'MemoryStorageProvider';

    expect(['memory', 'cloudinary']).toContain(env.STORAGE_PROVIDER);
    expect(env.STORAGE_PROVIDER).toBe(process.env.STORAGE_PROVIDER);
    expect(storageProvider.constructor.name).toBe(expected);
  });

  it('uses credential-free console/memory providers for the default test configuration', () => {
    expect(env.EMAIL_PROVIDER).toBe('console');
    expect(env.STORAGE_PROVIDER).toBe('memory');
    expect(emailProvider.constructor.name).toBe('ConsoleEmailProvider');
    expect(storageProvider.constructor.name).toBe('MemoryStorageProvider');
  });
});
