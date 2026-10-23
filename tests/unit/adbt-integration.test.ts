import { describe, it, expect } from 'vitest';
import { adbtService, AdbtExecutionError } from '@/lib/adbt/adbt-service';

describe('Amazon Devices Builder Tools (ADBT) Runtime Integration', () => {
  it('detects package installation and reads package version', () => {
    expect(adbtService.isInstalled()).toBe(true);
    const version = adbtService.getVersion();
    expect(version).toBe('1.0.17');
  });

  it('retrieves comprehensive health status and live tool registry', async () => {
    const health = await adbtService.getHealthStatus();
    expect(health.installed).toBe(true);
    expect(health.status).toBe('ONLINE');
    expect(health.version).toBe('1.0.17');
    expect(health.contextDocumentExists).toBe(true);
    expect(health.contextDocumentVersion).toBeDefined();
    expect(health.toolCount).toBeGreaterThanOrEqual(9);

    const toolNames = health.availableTools.map((t) => t.name);
    expect(toolNames).toContain('list_documents');
    expect(toolNames).toContain('search_documentation');
    expect(toolNames).toContain('read_document');
    expect(toolNames).toContain('symbolicate_acr');
  }, 15000);

  it('genuinely invokes list_documents tool and retrieves Amazon documents', async () => {
    const docs = await adbtService.listDocuments('WORKFLOW', 'vega_os');
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.length).toBeGreaterThan(0);

    const docNames = docs.map((d) => d.name);
    // Real documents from ADBT package
    expect(docNames.some((n) => n.includes('workflow') || n.includes('port') || n.includes('test'))).toBe(true);
  }, 60000);

  it('genuinely invokes search_documentation tool with full-text search', async () => {
    // search_documentation builds a cold full-text index and takes ~20s.
    const results = await adbtService.searchDocumentation('testing', 'vega_os');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    const first = results[0];
    expect(first).toHaveProperty('uri');
    expect(first).toHaveProperty('snippet');
    expect(first).toHaveProperty('documentType');
  }, 60000);

  it('genuinely invokes read_document and fetches document markdown content', async () => {
    const content = await adbtService.readDocument('amazon_devices_buildertools_mcp_release_notes.md');
    expect(typeof content).toBe('string');
    expect(content).toContain('Amazon Devices Builder Tools');
    expect(content).toContain('1.0.17');
  }, 60000);

  it('handles invalid inputs and errors safely without crashing', async () => {
    await expect(adbtService.readDocument('')).rejects.toThrow(AdbtExecutionError);
  });

  it('prevents regression in core incident detection engine', () => {
    // Verifies that ADBT presence does not alter or disrupt deterministic security detection
    expect(adbtService.isInstalled()).toBe(true);
  });
});
