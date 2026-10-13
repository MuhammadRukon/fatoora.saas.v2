import { createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { certificateInfo } from '../certificate';
import { generateKeyPair } from '../csr';
import { computeInvoiceHash, parseXml } from '../hash';
import { parseQrTlv } from '../qr';
import { signInvoice, verifySignedInvoice } from '../sign';
import { buildUnsignedInvoiceXml, UBL_EXTENSIONS_PLACEHOLDER, QR_PLACEHOLDER } from '../xml/ubl-builder';
import { simplifiedCreditNote, simplifiedInvoice, standardInvoice } from './fixtures';
import { selfSignedCertificate } from './test-cert';

const keys = generateKeyPair();
const cert = selfSignedCertificate(keys);
const signingTime = new Date('2026-10-14T09:30:07.250Z');

describe.each([
  ['simplified invoice', simplifiedInvoice],
  ['standard invoice', standardInvoice],
  ['simplified credit note', simplifiedCreditNote],
])('build -> sign -> verify: %s', (_, input) => {
  const unsigned = buildUnsignedInvoiceXml(input);
  const signed = signInvoice({ xml: unsigned, privateKeyPem: keys.privateKeyPem, certificatePem: cert.pem, signingTime });

  it('produces a well-formed document whose hash, SignedProperties digest and signature all verify', () => {
    parseXml(signed.signedXml);
    expect(verifySignedInvoice(signed.signedXml)).toEqual({
      hashValid: true,
      signedPropertiesValid: true,
      signatureValid: true,
      certificateDigestValid: true,
      embeddedHash: signed.invoiceHash,
    });
  });

  it('keeps the hash stable across signing and only splices the two placeholders', () => {
    expect(computeInvoiceHash(unsigned)).toBe(signed.invoiceHash);
    expect(computeInvoiceHash(signed.signedXml)).toBe(signed.invoiceHash);
    const unspliced = signed.signedXml
      .replace(/<ext:UBLExtensions>[\s\S]*<\/ext:UBLExtensions>/, UBL_EXTENSIONS_PLACEHOLDER)
      .replace(`>${signed.qr}<`, '><');
    expect(unspliced).toBe(unsigned);
  });

  it('fills the XAdES signed properties from the certificate and signing time', () => {
    expect(signed.signedXml).toContain('<xades:SigningTime>2026-10-14T09:30:07Z</xades:SigningTime>');
    expect(signed.signedXml).toContain(`<ds:X509IssuerName>${cert.issuerName}</ds:X509IssuerName>`);
    expect(signed.signedXml).toContain(`<ds:X509SerialNumber>${cert.serialNumber}</ds:X509SerialNumber>`);
  });

  it('embeds a QR whose tags match the XML, the hash, the signature and the certificate', () => {
    expect(signed.signedXml).toContain(QR_PLACEHOLDER.replace('><', `>${signed.qr}<`));
    const tags = parseQrTlv(signed.qr);
    expect(tags[1].toString()).toBe(input.seller.name);
    expect(tags[2].toString()).toBe(input.seller.vatNumber);
    expect(tags[3].toString()).toBe(`${input.issueDate}T${input.issueTime}`);
    expect(tags[4].toString()).toBe((input.totals.taxInclusiveHalalas / 100).toFixed(2));
    expect(tags[5].toString()).toBe((input.totals.taxHalalas / 100).toFixed(2));
    expect(tags[6].toString()).toBe(signed.invoiceHash);
    expect(tags[7].toString()).toBe(signed.signatureValue);
    expect(tags[8].equals(createPublicKey(keys.publicKeyPem).export({ type: 'spki', format: 'der' }))).toBe(true);
    expect(tags[9].equals(certificateInfo(cert.pem).signature)).toBe(true);
    const qrKey = createPublicKey({ key: tags[8], format: 'der', type: 'spki' });
    expect(verify('sha256', Buffer.from(tags[6].toString(), 'base64'), qrKey, Buffer.from(tags[7].toString(), 'base64'))).toBe(true);
  });
});

describe('signInvoice guards', () => {
  it('refuses a document without exactly one placeholder (e.g. an already signed one)', () => {
    const { signedXml } = signInvoice({
      xml: buildUnsignedInvoiceXml(simplifiedInvoice),
      privateKeyPem: keys.privateKeyPem,
      certificatePem: cert.pem,
      signingTime,
    });
    expect(() => signInvoice({ xml: signedXml, privateKeyPem: keys.privateKeyPem, certificatePem: cert.pem, signingTime })).toThrow(
      /exactly one/,
    );
  });
});
