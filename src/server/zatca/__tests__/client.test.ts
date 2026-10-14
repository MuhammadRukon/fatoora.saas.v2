import { describe, expect, it, vi } from 'vitest';

import { createZatcaClient, redactHeaders, summarizeValidation, type ZatcaOutcome } from '../client';

const auth = { binarySecurityToken: 'TOKEN123', secret: 'S3CR3T' };
const reply = (status: number, body: unknown = { ok: true }) =>
  vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
const payload = { invoiceHash: 'h', uuid: 'u', invoice: 'eA==' };

describe('zatca client outcomes (AC6.2)', () => {
  const cases: [number, ZatcaOutcome][] = [
    [200, 'PASS'],
    [202, 'WARNING'],
    [303, 'CLEARANCE_DISABLED'],
    [400, 'REJECTED'],
    [401, 'AUTH_ERROR'],
    [403, 'AUTH_ERROR'],
    [413, 'SERVER_ERROR'],
    [500, 'SERVER_ERROR'],
  ];
  it.each(cases)('maps HTTP %i to %s and keeps the raw body', async (status, outcome) => {
    const body = { validationResults: { status: 'X' }, extra: [1] };
    const res = await createZatcaClient('SIMULATION', reply(status, body)).report(auth, payload);
    expect(res).toEqual({ httpStatus: status, body, outcome });
  });

  it('maps a thrown fetch and an abort to NETWORK_ERROR', async () => {
    const boom = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect((await createZatcaClient('SIMULATION', boom).report(auth, payload)).outcome).toBe('NETWORK_ERROR');

    const hang = vi.fn(
      (_u: unknown, init: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        ),
    );
    const res = await createZatcaClient('SIMULATION', hang as never, { timeoutMs: 10 }).report(auth, payload);
    expect(res).toMatchObject({ outcome: 'NETWORK_ERROR', httpStatus: 0 });
  });

  it('keeps a non-JSON body as raw text', async () => {
    const res = await createZatcaClient('SIMULATION', reply(500, '<html>oops</html>')).report(auth, payload);
    expect(res.body).toEqual({ raw: '<html>oops</html>' });
  });
});

describe('zatca client requests (AC6.2)', () => {
  const call = async (
    fn: (c: ReturnType<typeof createZatcaClient>) => Promise<unknown>,
    env: 'SIMULATION' | 'PRODUCTION' = 'SIMULATION',
  ) => {
    const f = reply(200);
    await fn(createZatcaClient(env, f));
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    return { url, init, headers: init.headers as Record<string, string> };
  };

  it('requestComplianceCsid: POST /compliance with the OTP header and no Authorization', async () => {
    const { url, init, headers } = await call((c) => c.requestComplianceCsid('123456', 'CSRB64'));
    expect(url).toBe('https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation/compliance');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ csr: 'CSRB64' });
    expect(headers).toMatchObject({
      OTP: '123456',
      'Accept-Version': 'V2',
      'Accept-Language': 'en',
      'Content-Type': 'application/json',
    });
    expect(headers.Authorization).toBeUndefined();
  });

  it('authenticated calls send Basic base64(token:secret) and no OTP; PRODUCTION uses core', async () => {
    const expected = `Basic ${Buffer.from('TOKEN123:S3CR3T').toString('base64')}`;
    const a = await call((c) => c.checkCompliance(auth, payload), 'PRODUCTION');
    expect(a.url).toBe('https://gw-fatoora.zatca.gov.sa/e-invoicing/core/compliance/invoices');
    expect(a.headers.Authorization).toBe(expected);
    expect(a.headers['Accept-Version']).toBe('V2');
    expect(a.headers.OTP).toBeUndefined();

    const p = await call((c) => c.requestProductionCsid(auth, 'REQ1'));
    expect(p.url).toMatch(/\/simulation\/production\/csids$/);
    expect(JSON.parse(p.init.body as string)).toEqual({ compliance_request_id: 'REQ1' });

    const r = await call((c) => c.report(auth, payload));
    expect(r.url).toMatch(/\/invoices\/reporting\/single$/);
    expect(r.headers['Clearance-Status']).toBeUndefined();

    const cl = await call((c) => c.clear(auth, payload));
    expect(cl.url).toMatch(/\/invoices\/clearance\/single$/);
    expect(cl.headers['Clearance-Status']).toBe('1');
    expect(cl.headers.OTP).toBeUndefined();
  });

  it('the logger output contains neither the secret, the token nor the OTP', async () => {
    const lines: unknown[] = [];
    const c = createZatcaClient('SIMULATION', reply(200), { logger: (e) => lines.push(e) });
    await c.requestComplianceCsid('654321', 'CSR');
    await c.checkCompliance(auth, payload);
    const out = JSON.stringify(lines);
    expect(lines).toHaveLength(2);
    for (const secret of ['654321', 'S3CR3T', 'TOKEN123', Buffer.from('TOKEN123:S3CR3T').toString('base64')]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('[REDACTED]');
  });

  it('redactHeaders is case-insensitive', () => {
    expect(redactHeaders({ authorization: 'x', otp: '1', Accept: 'y' })).toEqual({
      authorization: '[REDACTED]',
      otp: '[REDACTED]',
      Accept: 'y',
    });
  });
});

describe('summarizeValidation', () => {
  it('reads ZATCA validationResults arrays', () => {
    const s = summarizeValidation({
      validationResults: {
        status: 'WARNING',
        infoMessages: [{ type: 'INFO', code: 'a', message: 'i' }],
        warningMessages: [{ type: 'WARNING', code: 'w', message: 'w1' }],
        errorMessages: [{ type: 'ERROR', code: 'e', message: 'e1' }],
      },
    });
    expect(s).toMatchObject({ infos: 1, warnings: 1, errors: 1, errorMessages: ['e: e1'], warningMessages: ['w: w1'] });
  });

  it('collects top-level error shapes and tolerates junk', () => {
    expect(summarizeValidation({ code: 'Invalid-OTP', message: 'Invalid OTP' }).errorMessages).toEqual([
      'Invalid-OTP: Invalid OTP',
    ]);
    expect(summarizeValidation({ errors: [{ code: 'x', message: 'm' }] }).errorMessages).toEqual(['x: m']);
    expect(summarizeValidation(null)).toMatchObject({ infos: 0, warnings: 0, errors: 0 });
    expect(summarizeValidation({ validationResults: 'nope' }).errors).toBe(0);
  });
});
