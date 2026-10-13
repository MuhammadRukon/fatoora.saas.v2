import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { computeInvoiceHash, NS, parseXml } from '../hash';
import { parseQrTlv } from '../qr';
import { signedPropertiesDigest, verifySignedInvoice } from '../sign';

// Official ZATCA SDK samples (gitignored, copied by the user from the SDK ZIP: Data/Samples/**).
const SAMPLES_DIR = fileURLToPath(new URL('../../../../tools/zatca-samples', import.meta.url));
const files = existsSync(SAMPLES_DIR)
  ? readdirSync(SAMPLES_DIR, { recursive: true, encoding: 'utf8' }).filter((f) => f.toLowerCase().endsWith('.xml'))
  : [];
if (!files.length) console.warn('ZATCA SDK samples missing: copy *.xml from the SDK ZIP into tools/zatca-samples/');

let checked = 0;

describe.skipIf(!files.length)('golden: ZATCA SDK samples (AC5.1, AC5.2)', () => {
  afterAll(() => console.log(`golden: ${checked}/${files.length} SDK samples checked`));

  it.each(files)('%s', (file) => {
    const xml = readFileSync(join(SAMPLES_DIR, file), 'utf8');
    const doc = parseXml(xml);
    const refs = doc.getElementsByTagNameNS(NS.ds, 'Reference');
    const digest = (attr: string, value: string) => {
      for (let i = 0; i < refs.length; i++) {
        const r = refs.item(i)!;
        if (r.getAttribute(attr) === value) return r.getElementsByTagNameNS(NS.ds, 'DigestValue').item(0)!.textContent;
      }
      throw new Error(`${file}: no ds:Reference[@${attr}='${value}']`);
    };

    // AC5.1
    const hash = computeInvoiceHash(xml);
    expect(hash).toBe(digest('Id', 'invoiceSignedData'));
    // AC5.2
    expect(signedPropertiesDigest(xml)).toBe(digest('URI', '#xadesSignedProperties'));
    expect(verifySignedInvoice(xml)).toMatchObject({ signatureValid: true, certificateDigestValid: true });

    // QR tags 1-5 mirror the XML; tag 6 is the hash.
    const qrRef = Array.from({ length: doc.getElementsByTagNameNS(NS.cac, 'AdditionalDocumentReference').length }, (_, i) =>
      doc.getElementsByTagNameNS(NS.cac, 'AdditionalDocumentReference').item(i)!,
    ).find((r) => r.getElementsByTagNameNS(NS.cbc, 'ID').item(0)?.textContent?.trim() === 'QR');
    if (qrRef) {
      const tags = parseQrTlv(qrRef.getElementsByTagNameNS(NS.cbc, 'EmbeddedDocumentBinaryObject').item(0)!.textContent!.trim());
      const cbc = (name: string, scope = doc.documentElement!) => scope.getElementsByTagNameNS(NS.cbc, name).item(0)?.textContent;
      const supplier = doc.getElementsByTagNameNS(NS.cac, 'AccountingSupplierParty').item(0)!;
      const time = cbc('IssueTime')!;
      expect(tags[1].toString()).toBe(cbc('RegistrationName', supplier));
      expect(tags[2].toString()).toBe(cbc('CompanyID', supplier));
      expect(tags[3].toString()).toBe(`${cbc('IssueDate')}T${time.endsWith('Z') ? time : `${time}Z`}`);
      expect(tags[4].toString()).toBe(cbc('TaxInclusiveAmount'));
      expect(tags[5].toString()).toBe(cbc('TaxAmount', doc.getElementsByTagNameNS(NS.cac, 'TaxTotal').item(0)!));
      expect(tags[6].toString()).toBe(hash);
    }
    checked++;
  });
});
