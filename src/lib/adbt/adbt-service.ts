import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { AdbtToolName, AdbtDocument, AdbtSearchResult, AdbtHealthStatus } from './adbt-types';

export class AdbtExecutionError extends Error {
  constructor(message: string, public readonly stderr?: string) {
    super(message);
    this.name = 'AdbtExecutionError';
  }
}

export class AdbtService {
  private static instance: AdbtService;
  private readonly projectRoot: string;
  private readonly startServerPath: string;
  private readonly packageJsonPath: string;

  private constructor() {
    this.projectRoot = process.cwd();
    this.startServerPath = path.resolve(
      this.projectRoot,
      'node_modules/@amazon-devices/amazon-devices-buildertools-mcp/dist/startserver'
    );
    this.packageJsonPath = path.resolve(
      this.projectRoot,
      'node_modules/@amazon-devices/amazon-devices-buildertools-mcp/package.json'
    );
  }

  public static getInstance(): AdbtService {
    if (!AdbtService.instance) {
      AdbtService.instance = new AdbtService();
    }
    return AdbtService.instance;
  }

  /**
   * Checks whether the ADBT MCP package is installed locally
   */
  public isInstalled(): boolean {
    return fs.existsSync(this.startServerPath) && fs.existsSync(this.packageJsonPath);
  }

  /**
   * Returns package version from package.json
   */
  public getVersion(): string {
    try {
      if (fs.existsSync(this.packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf-8'));
        return pkg.version || 'unknown';
      }
    } catch {
      // ignore
    }
    return 'unknown';
  }

  /**
   * Executes an ADBT MCP tool safely via execFile (no shell expansion).
   *
   * `search_documentation` does a cold full-text index build and regularly takes
   * 15-25s, so the previous 10s default aborted legitimate calls. 45s covers the
   * observed worst case while still bounding a hung server.
   */
  public async executeTool<T = unknown>(
    toolName: AdbtToolName,
    args: Record<string, unknown>,
    timeoutMs = 45000
  ): Promise<T> {
    if (!this.isInstalled()) {
      throw new AdbtExecutionError(
        `ADBT package not installed at ${this.startServerPath}. Run 'npm install -D @amazon-devices/amazon-devices-buildertools-mcp'`
      );
    }

    const jsonArgs = JSON.stringify(args);

    return new Promise<T>((resolve, reject) => {
      // Use process.execPath (current node binary) with startserver script
      execFile(
        process.execPath,
        [this.startServerPath, 'exec', toolName, '--args', jsonArgs],
        {
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024,
          cwd: this.projectRoot,
        },
        (error, stdout, stderr) => {
          if (error) {
            const errOut = stderr || stdout || error.message;
            reject(new AdbtExecutionError(`ADBT tool execution failed for '${toolName}': ${errOut}`, stderr));
            return;
          }

          try {
            const trimmed = stdout.trim();
            // Handle output that may be JSON
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              resolve(JSON.parse(trimmed) as T);
            } else {
              resolve(trimmed as unknown as T);
            }
          } catch (parseErr) {
            reject(new AdbtExecutionError(`Failed to parse ADBT output as JSON: ${stdout}`, stderr));
          }
        }
      );
    });
  }

  /**
   * Lists available documentation documents filtered by type and OS
   */
  public async listDocuments(
    documentType?: 'KB' | 'PROMPT' | 'STEERING' | 'WORKFLOW' | 'SKILL',
    deviceOs: 'vega_os' | 'fire_os' = 'vega_os'
  ): Promise<AdbtDocument[]> {
    const args: Record<string, unknown> = {
      target_platform: {
        device_os: [deviceOs],
      },
    };
    if (documentType) {
      args.documentType = documentType;
    }

    const docs = await this.executeTool<AdbtDocument[]>('list_documents', args);
    return Array.isArray(docs) ? docs : [];
  }

  /**
   * Searches Amazon Devices documentation for a given full-text query
   */
  public async searchDocumentation(
    query: string,
    deviceOs: 'vega_os' | 'fire_os' = 'vega_os'
  ): Promise<AdbtSearchResult[]> {
    if (!query.trim()) return [];

    const args = {
      query: query.trim(),
      target_platform: {
        device_os: [deviceOs],
      },
    };

    const results = await this.executeTool<AdbtSearchResult[]>('search_documentation', args);
    return Array.isArray(results) ? results : [];
  }

  /**
   * Reads the full markdown content of a documentation URI
   */
  public async readDocument(documentUri: string): Promise<string> {
    if (!documentUri.trim()) {
      throw new AdbtExecutionError('documentUri cannot be empty');
    }

    const args = {
      document_uri: documentUri.trim(),
    };

    return this.executeTool<string>('read_document', args);
  }

  /**
   * Retrieves comprehensive diagnostics and health telemetry for ADBT
   */
  public async getHealthStatus(): Promise<AdbtHealthStatus> {
    const isInstalled = this.isInstalled();
    const version = this.getVersion();
    const contextDocPath = path.resolve(this.projectRoot, '.gemini/GEMINI.md');
    const contextDocumentExists = fs.existsSync(contextDocPath);

    let contextVersion: string | undefined;
    if (contextDocumentExists) {
      try {
        const content = fs.readFileSync(contextDocPath, 'utf-8');
        const match = content.match(/v\d+\.\d+/);
        contextVersion = match ? match[0] : 'v7.0';
      } catch {
        contextVersion = 'v7.0';
      }
    }

    if (!isInstalled) {
      return {
        installed: false,
        version: 'not installed',
        packagePath: this.startServerPath,
        mcpConfigured: false,
        contextDocumentExists,
        contextDocumentVersion: contextVersion,
        toolCount: 0,
        availableTools: [],
        lastChecked: new Date().toISOString(),
        status: 'OFFLINE',
        error: 'Package @amazon-devices/amazon-devices-buildertools-mcp not installed.',
      };
    }

    const startTime = Date.now();
    try {
      // Execute `exec --list` to inspect live tool registry and measure roundtrip latency
      const listOutput = await new Promise<string>((resolve, reject) => {
        execFile(
          process.execPath,
          [this.startServerPath, 'exec', '--list'],
          { timeout: 5000, cwd: this.projectRoot },
          (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout);
          }
        );
      });

      const latencyMs = Date.now() - startTime;
      const parsedTools = this.parseToolsFromListOutput(listOutput);

      return {
        installed: true,
        version,
        packagePath: this.startServerPath,
        mcpConfigured: true,
        contextDocumentExists,
        contextDocumentVersion: contextVersion,
        toolCount: parsedTools.length,
        availableTools: parsedTools,
        executionLatencyMs: latencyMs,
        lastChecked: new Date().toISOString(),
        status: 'ONLINE',
      };
    } catch (err: unknown) {
      return {
        installed: true,
        version,
        packagePath: this.startServerPath,
        mcpConfigured: true,
        contextDocumentExists,
        contextDocumentVersion: contextVersion,
        toolCount: 0,
        availableTools: [],
        lastChecked: new Date().toISOString(),
        status: 'DEGRADED',
        error: (err as Error).message,
      };
    }
  }

  private parseToolsFromListOutput(output: string): Array<{ name: string; description: string }> {
    const tools: Array<{ name: string; description: string }> = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('Available tools:')) continue;
      // Format is: `  tool_name            Description text...`
      const match = trimmed.match(/^([a-z0-9_]+)\s+(.+)$/);
      if (match) {
        tools.push({
          name: match[1],
          description: match[2].trim(),
        });
      }
    }

    return tools;
  }
}

export const adbtService = AdbtService.getInstance();
