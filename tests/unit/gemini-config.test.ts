import { describe, it, expect, afterEach, vi } from 'vitest';
import { isGeminiConfigured, getGeminiModelName } from '@/lib/ai/gemini-client';

const ORIGINAL_KEY = process.env.GEMINI_API_KEY;

afterEach(() => {
  vi.unstubAllEnvs();
  if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
});

describe('Gemini configuration detection', () => {
  it('reports unconfigured when no key is set', () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(isGeminiConfigured()).toBe(false);
  });

  it('treats template placeholders as unconfigured', () => {
    for (const placeholder of ['your_gemini_api_key_here', 'your-api-key', 'PLACEHOLDER', 'changeme']) {
      vi.stubEnv('GEMINI_API_KEY', placeholder);
      expect(isGeminiConfigured(), placeholder).toBe(false);
    }
  });

  it('reports configured for a real-looking key', () => {
    vi.stubEnv('GEMINI_API_KEY', 'AIzaSyD-example-real-looking-key');
    expect(isGeminiConfigured()).toBe(true);
  });

  it('defaults the model name when unset', () => {
    vi.stubEnv('GEMINI_MODEL', '');
    expect(getGeminiModelName()).toBe('gemini-2.5-flash');
  });
});
