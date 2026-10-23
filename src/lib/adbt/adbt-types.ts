export type AdbtToolName =
  | 'list_documents'
  | 'search_documentation'
  | 'read_document'
  | 'report_workflow_status'
  | 'set_project_context'
  | 'analyze_perfetto_traces'
  | 'get_app_hot_functions'
  | 'symbolicate_acr';

export interface AdbtDocument {
  name: string;
  description: string;
  documentType?: string;
}

export interface AdbtSearchResult {
  uri: string;
  snippet: string;
  documentType: string;
}

export interface AdbtHealthStatus {
  installed: boolean;
  version: string;
  packagePath: string;
  mcpConfigured: boolean;
  contextDocumentExists: boolean;
  contextDocumentVersion?: string;
  toolCount: number;
  availableTools: Array<{
    name: string;
    description: string;
  }>;
  executionLatencyMs?: number;
  lastChecked: string;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  error?: string;
}
