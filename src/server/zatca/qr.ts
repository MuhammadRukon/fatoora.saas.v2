// QR TLV per Security Features Standard v1.2 sec. 4: 1-byte tag, 1-byte length, UTF-8 value, base64 of the whole.
// Tags 6/7 carry the base64 hash/signature *text*; tags 8/9 carry raw DER bytes (guideline v2 sec. 6.2 example).

export class ZatcaQrError extends Error {
  constructor(public readonly code: 'QR_FIELD_TOO_LONG' | 'QR_TOO_LONG' | 'QR_MALFORMED', message: string) {
    super(`${code}: ${message}`);
    this.name = 'ZatcaQrError';
  }
}

export type QrFields = {
  sellerName: string; // 1
  vatNumber: string; // 2
  timestamp: string; // 3, YYYY-MM-DDTHH:mm:ssZ
  totalWithVat: string; // 4
  vatTotal: string; // 5
  invoiceHash?: string; // 6
  signature?: string; // 7
  publicKey?: Uint8Array; // 8, SubjectPublicKeyInfo DER
  certificateSignature?: Uint8Array; // 9
};

// Published limit is 700; ZATCA raised it to 1000 in SDK 3.3.4 (plan, ZATCA Phase 2 facts).
export const QR_MAX_BASE64_LENGTH = 1000;

export function buildQrTlv(f: QrFields): string {
  const values = [f.sellerName, f.vatNumber, f.timestamp, f.totalWithVat, f.vatTotal, f.invoiceHash, f.signature, f.publicKey, f.certificateSignature];
  const parts: Buffer[] = [];
  values.forEach((v, i) => {
    if (v === undefined) return;
    const bytes = typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v);
    if (bytes.length > 255) throw new ZatcaQrError('QR_FIELD_TOO_LONG', `tag ${i + 1} is ${bytes.length} bytes (max 255)`);
    parts.push(Buffer.from([i + 1, bytes.length]), bytes);
  });
  const qr = Buffer.concat(parts).toString('base64');
  if (qr.length > QR_MAX_BASE64_LENGTH) throw new ZatcaQrError('QR_TOO_LONG', `${qr.length} base64 chars (max ${QR_MAX_BASE64_LENGTH})`);
  return qr;
}

export function parseQrTlv(base64: string): Record<number, Buffer> {
  const buf = Buffer.from(base64, 'base64');
  const tags: Record<number, Buffer> = {};
  for (let i = 0; i < buf.length; ) {
    if (i + 2 > buf.length || i + 2 + buf[i + 1] > buf.length) throw new ZatcaQrError('QR_MALFORMED', `truncated TLV at byte ${i}`);
    tags[buf[i]] = buf.subarray(i + 2, i + 2 + buf[i + 1]);
    i += 2 + buf[i + 1];
  }
  return tags;
}

/** The QR stamp (base64 TLV) inside a cleared or signed invoice XML, or undefined when absent. */
export function extractQrFromXml(xml: string): string | undefined {
  const m = /<cbc:ID>QR<\/cbc:ID>[\s\S]*?<cbc:EmbeddedDocumentBinaryObject[^>]*>\s*([^<\s]+)\s*</.exec(xml);
  return m?.[1];
}
