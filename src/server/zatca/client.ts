import type { ZatcaEnvironment } from './csr';

// ZATCA gateway client. Pure and injectable: fetch and logger are arguments, nothing reads env or the DB.
// Response JSON shapes are unverified until the Simulation gate (AC6.4), so bodies are kept whole and parsed defensively.
export type ZatcaOutcome =
  | 'PASS'
  | 'WARNING'
  | 'REJECTED'
  | 'CLEARANCE_DISABLED'
  | 'AUTH_ERROR'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR';

export type ZatcaResponse = { httpStatus: number; body: unknown; outcome: ZatcaOutcome };
export type ZatcaAuth = { binarySecurityToken: string; secret: string };
export type ZatcaInvoicePayload = { invoiceHash: string; uuid: string; invoice: string };
export type ZatcaLogEntry = {
  method: string;
  url: string;
  headers: Record<string, string>;
  httpStatus: number;
  outcome: ZatcaOutcome;
};
type Options = { timeoutMs?: number; logger?: (entry: ZatcaLogEntry) => void };

const SENSITIVE = new Set(['authorization', 'otp']);
export const redactHeaders = (h: Record<string, string>) =>
  Object.fromEntries(Object.entries(h).map(([k, v]) => [k, SENSITIVE.has(k.toLowerCase()) ? '[REDACTED]' : v]));

function outcomeFor(status: number): ZatcaOutcome {
  if (status === 200) return 'PASS';
  if (status === 202) return 'WARNING';
  if (status === 303) return 'CLEARANCE_DISABLED';
  if (status === 400) return 'REJECTED';
  if (status === 401 || status === 403) return 'AUTH_ERROR';
  // Anything else (413, 404, 5xx) is not a verdict on the document.
  return 'SERVER_ERROR';
}

export function createZatcaClient(env: ZatcaEnvironment, fetchImpl: typeof fetch = fetch, opts: Options = {}) {
  const base = `https://gw-fatoora.zatca.gov.sa/e-invoicing/${env === 'PRODUCTION' ? 'core' : 'simulation'}`;

  async function post(path: string, body: unknown, extra: Record<string, string>): Promise<ZatcaResponse> {
    const headers = { 'Accept-Version': 'V2', 'Accept-Language': 'en', 'Content-Type': 'application/json', ...extra };
    const url = `${base}${path}`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 30_000);
    let res: ZatcaResponse;
    try {
      const r = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: ctl.signal,
        redirect: 'manual', // 303 is a verdict (clearance disabled); never follow it with credentials
      });
      const text = await r.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
      res = { httpStatus: r.status, body: parsed, outcome: outcomeFor(r.status) };
    } catch (e) {
      res = { httpStatus: 0, body: { error: e instanceof Error ? e.message : String(e) }, outcome: 'NETWORK_ERROR' };
    } finally {
      clearTimeout(timer);
    }
    opts.logger?.({
      method: 'POST',
      url,
      headers: redactHeaders(headers),
      httpStatus: res.httpStatus,
      outcome: res.outcome,
    });
    return res;
  }

  const basic = (a: ZatcaAuth) => ({
    Authorization: `Basic ${Buffer.from(`${a.binarySecurityToken}:${a.secret}`).toString('base64')}`,
  });

  return {
    requestComplianceCsid: (otp: string, csrB64: string) => post('/compliance', { csr: csrB64 }, { OTP: otp }),
    checkCompliance: (a: ZatcaAuth, p: ZatcaInvoicePayload) => post('/compliance/invoices', p, basic(a)),
    requestProductionCsid: (a: ZatcaAuth, complianceRequestId: string) =>
      post('/production/csids', { compliance_request_id: complianceRequestId }, basic(a)),
    report: (a: ZatcaAuth, p: ZatcaInvoicePayload) => post('/invoices/reporting/single', p, basic(a)),
    clear: (a: ZatcaAuth, p: ZatcaInvoicePayload) =>
      post('/invoices/clearance/single', p, { ...basic(a), 'Clearance-Status': '1' }),
  };
}

export type ZatcaClient = ReturnType<typeof createZatcaClient>;

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const line = (m: unknown) => {
  const r = asRecord(m);
  const msg = typeof r.message === 'string' ? r.message : typeof m === 'string' ? m : JSON.stringify(m);
  return typeof r.code === 'string' && r.code ? `${r.code}: ${msg}` : msg;
};

/** Counts and texts from a response body: ZATCA's validationResults plus the top-level error shapes seen on auth failures. */
export function summarizeValidation(body: unknown) {
  const b = asRecord(body);
  const vr = asRecord(b.validationResults);
  const infoMessages = asArray(vr.infoMessages).map(line);
  const warningMessages = asArray(vr.warningMessages).map(line);
  const errorMessages = asArray(vr.errorMessages).map(line);
  errorMessages.push(...asArray(b.errors).map(line));
  if (typeof b.message === 'string' && !('validationResults' in b)) errorMessages.push(line(b));
  return {
    status: typeof vr.status === 'string' ? vr.status : undefined,
    infos: infoMessages.length,
    warnings: warningMessages.length,
    errors: errorMessages.length,
    infoMessages,
    warningMessages,
    errorMessages,
  };
}
