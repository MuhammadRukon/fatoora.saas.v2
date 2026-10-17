import { describe, expect, it } from 'vitest';

import { buildComplianceDocuments } from '../compliance-docs';
import { generateKeyPair } from '../csr';
import { PIH_SEED } from '../hash';
import { verifySignedInvoice } from '../sign';
import { selfSignedCertificate } from './test-cert';
import { simplifiedInvoice } from './fixtures';

const keys = generateKeyPair();
const cert = selfSignedCertificate(keys);
const docs = buildComplianceDocuments({
  seller: simplifiedInvoice.seller,
  privateKeyPem: keys.privateKeyPem,
  certificatePem: cert.pem,
  now: new Date('2026-10-14T09:30:00Z'),
});

describe('buildComplianceDocuments', () => {
  it('makes 6 documents: standard + simplified x invoice/credit/debit', () => {
    expect(docs.map((d) => `${d.subtype}/${d.kind}`).sort()).toEqual([
      'SIMPLIFIED/CREDIT_NOTE',
      'SIMPLIFIED/DEBIT_NOTE',
      'SIMPLIFIED/INVOICE',
      'STANDARD/CREDIT_NOTE',
      'STANDARD/DEBIT_NOTE',
      'STANDARD/INVOICE',
    ]);
    expect(new Set(docs.map((d) => d.uuid)).size).toBe(6);
  });

  it('chains ICV 1..6 and PIH from the seed', () => {
    expect(docs.map((d) => d.icv)).toEqual([1, 2, 3, 4, 5, 6]);
    docs.forEach((d, i) => {
      const prev = i === 0 ? PIH_SEED : docs[i - 1].invoiceHash;
      expect(d.signedXml).toContain(`<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${prev}<`);
    });
  });

  it('notes bill against the invoice of their own subtype and carry a reason', () => {
    for (const d of docs.filter((x) => x.kind !== 'INVOICE')) {
      const ref = /<cac:BillingReference>[\s\S]*?<cbc:ID>([^<]+)</.exec(d.signedXml)![1];
      const inv = docs.find((x) => x.kind === 'INVOICE' && x.subtype === d.subtype)!;
      expect(inv.signedXml).toContain(`<cbc:ID>${ref}</cbc:ID>`);
      expect(d.signedXml).toContain('<cbc:Note>Compliance test</cbc:Note>');
    }
  });

  it('signs every document validly and the payload matches', () => {
    for (const d of docs) {
      const v = verifySignedInvoice(d.signedXml);
      expect(v).toMatchObject({ hashValid: true, signedPropertiesValid: true, signatureValid: true, certificateDigestValid: true });
      expect(d.payload).toEqual({
        invoiceHash: d.invoiceHash,
        uuid: d.uuid,
        invoice: Buffer.from(d.signedXml).toString('base64'),
      });
    }
  });
});
