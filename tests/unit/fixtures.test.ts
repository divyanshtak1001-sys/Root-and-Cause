import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseLogContent } from '@/lib/security/parsers/log-parser';

describe('synthetic demo fixtures parse cleanly', () => {
  const dir = path.resolve(__dirname, '../../public/samples');
  const files = [
    'synthetic_auth_brute_force.json',
    'synthetic_password_spray.csv',
    'synthetic_malformed_and_injection.csv',
  ];

  for (const f of files) {
    it(`parses ${f} without throwing`, () => {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      const result = parseLogContent(content, f, 'upl_fixture');
      expect(result.events.length + result.errors.length).toBeGreaterThan(0);
    });
  }
});
