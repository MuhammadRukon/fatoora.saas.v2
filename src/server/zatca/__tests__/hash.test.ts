import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// Signed simplified invoice shipped by zatca-xml-js (MIT). Its signature block, certificate and QR are the
// ones printed in the ZATCA Detailed Technical Guideline v2 (sec. 5.2 / 6.2), i.e. an SDK-produced sample.
import { valid_simplified_invoice_xml_sample } from 'zatca-xml-js/lib/samples';
import { computeInvoiceHash, PIH_SEED } from '../hash';

const sample = valid_simplified_invoice_xml_sample.trim();

describe('computeInvoiceHash', () => {
  it('matches the invoiceSignedData DigestValue embedded in a validator-accepted sample', () => {
    expect(computeInvoiceHash(sample)).toBe('oeRPH/CKLQuledRrrl2ckczL9bmtn7c8mxBFtNZkTRg=');
  });

  it('ignores UBLExtensions, cac:Signature and the QR reference but covers everything else', () => {
    const base = computeInvoiceHash(sample);
    expect(computeInvoiceHash(sample.replace('sample values only', 'changed'))).toBe(base);
    expect(computeInvoiceHash(sample.replace('<cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice', '<cbc:ID>x'))).toBe(base);
    expect(computeInvoiceHash(sample.replace('ARdBaG1l', 'AAAA'))).toBe(base);
    expect(computeInvoiceHash(sample.replace('<cbc:UUID>62</cbc:UUID>', '<cbc:UUID>63</cbc:UUID>'))).not.toBe(base);
  });
});

describe('PIH_SEED', () => {
  it('is base64 of the hex SHA-256 of "0" (XML Implementation Standard v1.2, BR-KSA-26)', () => {
    expect(PIH_SEED).toBe('NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==');
    expect(Buffer.from(createHash('sha256').update('0').digest('hex')).toString('base64')).toBe(PIH_SEED);
  });
});
