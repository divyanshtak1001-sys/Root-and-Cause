import { GoogleGenAI } from '@google/genai';

const PLACEHOLDER_KEY_PREFIXES = ['your_', 'your-', 'placeholder', 'changeme'];

function isPlaceholderKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return PLACEHOLDER_KEY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function getGeminiApiKey(): string | undefined {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  return key?.trim() || undefined;
}

export function getGeminiModelName(): string {
  return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
}

export function isGeminiConfigured(): boolean {
  const key = getGeminiApiKey();
  // Treat template values (e.g. "your_gemini_api_key_here") as unconfigured so we
  // never burn a request / surface a 400 instead of the deterministic fallback.
  return Boolean(key && key.length > 0 && !isPlaceholderKey(key));
}

export function createGeminiClient(): GoogleGenAI | null {
  const key = getGeminiApiKey();
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}
