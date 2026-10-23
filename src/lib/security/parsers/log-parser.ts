import Papa from 'papaparse';
import { NormalizedLogEvent, IngestRowError, LogResult } from '@/types';
import { generateId } from '@/lib/utils';

export const MAX_UPLOAD_ROWS = 5000;
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export interface ParseResult {
  events: NormalizedLogEvent[];
  errors: IngestRowError[];
  totalRows: number;
}

/**
 * Normalizes loose result strings into canonical LogResult
 */
export function normalizeResult(rawResult: unknown): LogResult {
  if (typeof rawResult !== 'string') return 'UNKNOWN';
  const val = rawResult.trim().toUpperCase();
  if (['SUCCESS', 'ALLOW', 'ALLOWED', 'OK', 'PASSED', 'TRUE', '200', 'INFO', 'INFORMATION', 'VERBOSE', 'AUDIT_SUCCESS'].includes(val)) return 'SUCCESS';
  if (['FAILURE', 'FAIL', 'FAILED', 'ERR', 'ERROR', 'INVALID', 'CRITICAL', 'WARNING', 'WARN', 'AUDIT_FAILURE'].includes(val)) return 'FAILURE';
  if (['DENIED', 'DENY', 'BLOCKED', 'REJECTED', 'UNAUTHORIZED', 'FORBIDDEN', '401', '403'].includes(val)) return 'DENIED';
  return 'UNKNOWN';
}

/**
 * Normalizes and validates timestamps (ISO-8601, RFC2822, regional DD-MM-YYYY, epoch).
 */
export function parseAndValidateTimestamp(rawTimestamp: unknown): string | null {
  if (!rawTimestamp) return null;
  const str = String(rawTimestamp).trim();
  if (!str) return null;

  // 1. Native Date parser (ISO-8601, RFC2822, YYYY-MM-DD, US MM/DD/YYYY)
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }

  // 2. Regional / Windows Event Log format: DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  // E.g. "21-10-2026 22:11:29"
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[\sT](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d+))?)?)?/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hours = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const minutes = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const seconds = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;

    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const parsedUtc = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
      if (!isNaN(parsedUtc.getTime())) {
        return parsedUtc.toISOString();
      }
    }
  }

  // 3. Unix epoch in seconds or milliseconds
  if (/^\d{10,13}$/.test(str)) {
    const epochNum = parseInt(str, 10);
    const epochDate = new Date(str.length === 10 ? epochNum * 1000 : epochNum);
    if (!isNaN(epochDate.getTime())) {
      return epochDate.toISOString();
    }
  }

  return null;
}

/**
 * Canonical field names the normalizer understands. Ordered by the canonical log
 * schema so a single missing column can be inferred positionally.
 */
export const CANONICAL_FIELDS = ['timestamp', 'event_type', 'username', 'source_ip', 'host', 'result'] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export const FIELD_ALIASES: Record<CanonicalField, string[]> = {
  timestamp: [
    'timestamp',
    'time',
    '@timestamp',
    'datetime',
    'date',
    'date and time',
    'date_and_time',
    'date/time',
    'date_time',
    'date & time',
    'timecreated',
    'event_time',
    'eventtime',
    'timestamp_utc',
    'log_time',
  ],
  event_type: [
    'event_type',
    'eventtype',
    'type',
    'action',
    'event',
    'activity',
    'operation',
    'category',
    'event_name',
    'eventname',
  ],
  username: [
    'username',
    'user',
    'user_id',
    'account',
    'actor',
    'user name',
    'target_user',
    'subject_user_name',
    'account_name',
    'accountname',
    'user_account',
    'login_id',
  ],
  source_ip: [
    'source_ip',
    'sourceip',
    'ip',
    'client_ip',
    'src_ip',
    'ip_address',
    'ipaddress',
    'clientip',
    'src',
    'remote_ip',
    'source_network_address',
    'src_addr',
    'origin_ip',
  ],
  host: [
    'host',
    'hostname',
    'destination',
    'server',
    'computer',
    'computername',
    'source',
    'provider',
    'device',
    'machine',
    'target_host',
    'node',
  ],
  result: [
    'result',
    'status',
    'outcome',
    'level',
    'severity',
    'audit_result',
    'disposition',
    'return_code',
  ],
};

export function fieldFor(header: string): CanonicalField | null {
  const rawKey = header.trim().toLowerCase();
  const normalizedKey = rawKey.replace(/[\s\-_/&.]+/g, '');
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES) as [CanonicalField, string[]][]) {
    for (const alias of aliases) {
      if (alias === rawKey || alias.replace(/[\s\-_/&.]+/g, '') === normalizedKey) {
        return canonical;
      }
    }
  }
  return null;
}

function getRawField(raw: Record<string, unknown>, aliases: string[]): unknown {
  for (const a of aliases) {
    if (raw[a] !== undefined && raw[a] !== null && String(raw[a]).trim() !== '') {
      return raw[a];
    }
  }
  const keys = Object.keys(raw);
  for (const a of aliases) {
    const aNorm = a.toLowerCase().replace(/[\s\-_/&.]+/g, '');
    for (const key of keys) {
      if (key.toLowerCase().replace(/[\s\-_/&.]+/g, '') === aNorm) {
        const val = raw[key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return val;
        }
      }
    }
  }
  return undefined;
}

/**
 * Validates and extracts a normalized log event from an arbitrary record.
 */
export function validateAndNormalizeRecord(
  raw: Record<string, unknown>,
  rowIndex: number,
  uploadId?: string
): { event?: NormalizedLogEvent; error?: IngestRowError } {
  // Support flexible field name mappings
  const rawTimestamp = getRawField(raw, FIELD_ALIASES.timestamp);
  const timestamp = parseAndValidateTimestamp(rawTimestamp);
  if (!timestamp) {
    return {
      error: {
        row: rowIndex,
        reason: 'Missing or invalid timestamp. Expected ISO-8601 or standard date format.',
        raw: JSON.stringify(raw).slice(0, 150),
      },
    };
  }

  let rawEventType = getRawField(raw, [
    'event_type',
    'eventType',
    'type',
    'action',
    'event',
    'activity',
    'operation',
    'event_name',
  ]);

  // Windows Event Viewer numeric ID: e.g. "Event ID": 16384, 4624, 1001
  const rawWindowsEventId = getRawField(raw, ['event id', 'eventid', 'event_code', 'eventcode']);
  const rawTaskCategory = getRawField(raw, ['task category', 'task_category', 'task']);
  const rawSource = getRawField(raw, ['source', 'provider']);

  if (!rawEventType || String(rawEventType).trim() === '') {
    if (rawWindowsEventId && /^\d+$/.test(String(rawWindowsEventId).trim())) {
      const eidStr = String(rawWindowsEventId).trim();
      const taskStr =
        rawTaskCategory && String(rawTaskCategory).trim().toLowerCase() !== 'none'
          ? String(rawTaskCategory).trim()
          : '';
      const srcStr = rawSource ? String(rawSource).trim() : '';

      // Standard Windows Event ID mapping for security engines
      if (eidStr === '4624') {
        rawEventType = 'WINDOWS_LOGON_SUCCESS (4624)';
      } else if (eidStr === '4625') {
        rawEventType = 'WINDOWS_LOGON_FAILURE (4625)';
      } else if (eidStr === '4648') {
        rawEventType = 'WINDOWS_EXPLICIT_LOGON (4648)';
      } else if (eidStr === '4672') {
        rawEventType = 'PRIVILEGE_ELEVATION (4672)';
      } else if (taskStr) {
        rawEventType = `${taskStr} (${eidStr})`;
      } else if (srcStr) {
        rawEventType = `${srcStr} (${eidStr})`;
      } else {
        rawEventType = `Event ${eidStr}`;
      }
    } else if (rawTaskCategory && String(rawTaskCategory).trim().toLowerCase() !== 'none' && rawSource) {
      rawEventType = `${String(rawSource).trim()}: ${String(rawTaskCategory).trim()}`;
    }
  }

  if (!rawEventType || String(rawEventType).trim() === '') {
    return {
      error: {
        row: rowIndex,
        reason: 'Missing required field: event_type',
        raw: JSON.stringify(raw).slice(0, 150),
      },
    };
  }

  const rawUsername = getRawField(raw, FIELD_ALIASES.username);
  const rawSourceIP = getRawField(raw, FIELD_ALIASES.source_ip);
  const rawHost = getRawField(raw, FIELD_ALIASES.host);
  const rawResult = getRawField(raw, FIELD_ALIASES.result);

  const rawMessage =
    getRawField(raw, ['message', 'description', 'details', 'notes']) ||
    (Array.isArray(raw.__parsed_extra) ? (raw.__parsed_extra as unknown[]).join(', ') : '');

  // Extract IP or Username from message payload if missing or default
  let cleanSourceIP = rawSourceIP ? String(rawSourceIP).trim() : '';
  if (!cleanSourceIP || cleanSourceIP === '0.0.0.0') {
    const ipMatch = String(rawMessage).match(
      /(?:IP Address|Client IP|Source IP|from IP|IP)\s*[:=]?\s*([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/i
    );
    if (ipMatch) {
      cleanSourceIP = ipMatch[1];
    } else {
      cleanSourceIP = '0.0.0.0';
    }
  }

  let cleanUsername = rawUsername ? String(rawUsername).trim() : '';
  if (!cleanUsername || cleanUsername === 'anonymous') {
    const userMatch = String(rawMessage).match(
      /(?:Account Name|User Name|Target Account Name|Subject User Name|User)\s*[:=]?\s*([a-zA-Z0-9_\-\.\$\\]+)/i
    );
    if (userMatch && !['-', 'SYSTEM', 'LOCAL SERVICE', 'NETWORK SERVICE'].includes(userMatch[1].toUpperCase())) {
      cleanUsername = userMatch[1].trim();
    } else {
      cleanUsername = cleanUsername || 'anonymous';
    }
  }

  const cleanHost = rawHost ? String(rawHost).trim() : 'unknown-host';
  const cleanEventType = String(rawEventType).slice(0, 100).trim();

  const eventId = raw.event_id || raw.id || raw.eventId
    ? String(raw.event_id || raw.id || raw.eventId).trim()
    : generateId('evt');

  const event: NormalizedLogEvent = {
    event_id: eventId,
    source_event_id: raw.event_id || rawWindowsEventId ? String(raw.event_id || rawWindowsEventId) : undefined,
    timestamp,
    event_type: cleanEventType,
    username: cleanUsername.slice(0, 100),
    source_ip: cleanSourceIP.slice(0, 50),
    host: cleanHost.slice(0, 100),
    result: normalizeResult(rawResult),
    raw_payload: raw,
    upload_id: uploadId,
  };

  return { event };
}

/**
 * Repairs rows that carry more values than the header declares.
 *
 * PapaParse surfaces surplus values in `__parsed_extra` and reports
 * `TooManyFields` ("expected 5 fields but parsed 6").
 *
 * Handled gracefully in two scenarios:
 *  1. Canonical field omitted in header (e.g. host or result): missing canonical field
 *     is mapped from the surplus or shifted values.
 *  2. Unheadered trailing message/description column (e.g. Windows Event Viewer CSV exports
 *     where header declares Level,Date and Time,Source,Event ID,Task Category and the 6th
 *     column is the event description): captured into message/description.
 */
export function repairExtraFields(
  row: Record<string, unknown>,
  headers: string[]
): Record<string, unknown> {
  const extra = row.__parsed_extra;
  if (!Array.isArray(extra) || extra.length === 0) return row;

  const declared = new Set(
    headers.map((h) => fieldFor(h)).filter((f): f is CanonicalField => Boolean(f))
  );

  const missing = CANONICAL_FIELDS.filter((field) => !declared.has(field));

  // Scenario 1: Exactly missing.length === extra.length canonical fields omitted from header
  if (missing.length === extra.length) {
    const lastDeclared = [...declared][declared.size - 1];
    const surplusValue = extra[extra.length - 1];
    const alignedValue = row[lastDeclared];

    const gapIndex = CANONICAL_FIELDS.indexOf(missing[0]);
    const lastDeclaredIndex = CANONICAL_FIELDS.indexOf(lastDeclared);

    if (gapIndex > lastDeclaredIndex) {
      const trailing: Record<string, unknown> = { ...row, [missing[0]]: surplusValue };
      delete trailing.__parsed_extra;
      return trailing;
    }

    const positional: Record<string, unknown> = {
      ...row,
      [lastDeclared]: surplusValue,
      [missing[0]]: alignedValue,
    };
    delete positional.__parsed_extra;

    if (lastDeclared === 'result') {
      const surplusLooksLikeResult = normalizeResult(surplusValue) !== 'UNKNOWN';
      const alignedLooksLikeResult = normalizeResult(alignedValue) !== 'UNKNOWN';

      if (surplusLooksLikeResult && !alignedLooksLikeResult) {
        const swapped: Record<string, unknown> = { ...row, result: surplusValue, [missing[0]]: alignedValue };
        delete swapped.__parsed_extra;
        return swapped;
      }

      if (alignedLooksLikeResult) {
        const asIs: Record<string, unknown> = { ...row, [missing[0]]: surplusValue };
        delete asIs.__parsed_extra;
        return asIs;
      }
    }

    return positional;
  }

  // Scenario 2: Unheadered trailing message/description column (e.g. Windows Event Viewer CSV exports)
  // When declared canonical count is < 6 and no message header was declared
  const hasExplicitMessageHeader = headers.some((h) => /message|description|details|notes|payload/i.test(h));
  if (declared.size < 6 && !hasExplicitMessageHeader) {
    const message = extra.join(', ').trim();
    const repaired: Record<string, unknown> = {
      ...row,
      message,
      description: message,
    };
    delete repaired.__parsed_extra;
    return repaired;
  }

  return row;
}

/**
 * Parses raw text content (CSV or JSON) into NormalizedLogEvents.
 */
export function parseLogContent(content: string, filename: string, uploadId?: string): ParseResult {
  const isJson = filename.endsWith('.json') || content.trim().startsWith('[') || content.trim().startsWith('{');
  const events: NormalizedLogEvent[] = [];
  const errors: IngestRowError[] = [];
  const seenEventIds = new Set<string>();

  if (isJson) {
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(content);
    } catch (err: unknown) {
      return {
        events: [],
        errors: [{ row: 1, reason: `Malformed JSON: ${(err as Error).message}` }],
        totalRows: 0,
      };
    }

    const records = Array.isArray(parsedData) ? parsedData : [parsedData];
    if (records.length > MAX_UPLOAD_ROWS) {
      errors.push({
        row: MAX_UPLOAD_ROWS,
        reason: `Exceeded maximum batch limit of ${MAX_UPLOAD_ROWS} events. Truncating remaining rows.`,
      });
    }

    const slice = records.slice(0, MAX_UPLOAD_ROWS);
    slice.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        errors.push({ row: index + 1, reason: 'Row is not a valid JSON object.' });
        return;
      }
      const { event, error } = validateAndNormalizeRecord(item as Record<string, unknown>, index + 1, uploadId);
      if (error) {
        errors.push(error);
      } else if (event) {
        if (seenEventIds.has(event.event_id)) {
          return;
        }
        seenEventIds.add(event.event_id);
        events.push(event);
      }
    });

    return {
      events: events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
      errors,
      totalRows: records.length,
    };
  }

  // Parse CSV with PapaParse
  const parseConfig: Papa.ParseConfig = {
    header: true,
    skipEmptyLines: true,
  };

  const parsedCsv = Papa.parse<Record<string, unknown>>(content, parseConfig);
  const headers = (parsedCsv.meta?.fields ?? []).map(String);

  // Rows whose surplus fields we repair must not be double-reported as failures.
  const repairedRows = new Set<number>();
  const rows = parsedCsv.data.map((row, index) => {
    const hasExtra = Array.isArray(row.__parsed_extra) && row.__parsed_extra.length > 0;
    if (!hasExtra) return row;
    const repaired = repairExtraFields(row, headers);
    if (!repaired.__parsed_extra) {
      repairedRows.add(index);
    }
    return repaired;
  });

  if (parsedCsv.errors && parsedCsv.errors.length > 0) {
    parsedCsv.errors.forEach((e) => {
      // PapaParse reports `row` as the data row index (0-based); tolerate undefined.
      const isTooMany = e.type === 'FieldMismatch' && /too many fields/i.test(e.message);
      if (isTooMany && repairedRows.has(e.row ?? -1)) return;
      errors.push({
        row: (e.row ?? 0) + 1,
        reason: `CSV Parse error: ${e.message}`,
      });
    });
  }
  const rowCount = rows.length;

  if (rowCount > MAX_UPLOAD_ROWS) {
    errors.push({
      row: MAX_UPLOAD_ROWS,
      reason: `Exceeded maximum batch limit of ${MAX_UPLOAD_ROWS} rows. Truncating remainder.`,
    });
  }

  const processSlice = rows.slice(0, MAX_UPLOAD_ROWS);
  processSlice.forEach((row, idx) => {
    const { event, error } = validateAndNormalizeRecord(row, idx + 1, uploadId);
    if (error) {
      errors.push(error);
    } else if (event) {
      if (seenEventIds.has(event.event_id)) {
        return;
      }
      seenEventIds.add(event.event_id);
      events.push(event);
    }
  });

  return {
    events: events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    errors,
    totalRows: rowCount,
  };
}


