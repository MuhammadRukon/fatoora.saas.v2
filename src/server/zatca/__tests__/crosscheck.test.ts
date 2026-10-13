import { beforeAll, describe, expect, it } from 'vitest';
// Independent implementation (wes4m/zatca-xml-js, MIT, devDependency) used purely as a cross-check.
import { XMLDocument } from 'zatca-xml-js/lib/parser';
import { generateQR } from 'zatca-xml-js/lib/zatca/qr';
import { getCertificateInfo, getInvoiceHash } from 'zatca-xml-js/lib/zatca/signing';
import { certificateInfo } from '../certificate';
import { generateKeyPair } from '../csr';
import { computeInvoiceHash } from '../hash';
import { parseQrTlv } from '../qr';
import { signInvoice } from '../sign';
import { buildUnsignedInvoiceXml, UBL_EXTENSIONS_PLACEHOLDER } from '../xml/ubl-builder';
import { simplifiedCreditNote, simplifiedInvoice, standardInvoice } from './fixtures';
import { selfSignedCertificate } from './test-cert';
import { SAMPLE_CERT_BODY } from './vectors';

const keys = generateKeyPair();
const cert = selfSignedCertificate(keys);

// zatca-xml-js formats QR tag 3 with moment() in local time; pin the process to UTC so it is comparable.
beforeAll(() => {
  process.env.TZ = 'UTC';
});

describe.each([
  ['simplified invoice', simplifiedInvoice],
  ['standard invoice', standardInvoice],
  ['simplified credit note', simplifiedCreditNote],
])('zatca-xml-js cross-check (AC5.3): %s', (_, input) => {
  const unsigned = buildUnsignedInvoiceXml(input);
  // zatca-xml-js cannot delete an *empty* ext:UBLExtensions (its path lookup treats '' as missing), so it gets
  // its own unsigned-template marker inside. UBLExtensions content is excluded from the hash by definition.
  const forThem = unsigned.replace(UBL_EXTENSIONS_PLACEHOLDER, '<ext:UBLExtensions>SET_UBL_EXTENSIONS_STRING</ext:UBLExtensions>');

  it('computes the same invoice hash for the same unsigned XML', () => {
    // Their parser re-serializes the XML; the builder's layout is already its fixed point.
    expect(new XMLDocument(forThem).toString({ no_header: false }).trimEnd()).toBe(forThem);
    expect(computeInvoiceHash(unsigned)).toBe(computeInvoiceHash(forThem));
    expect(computeInvoiceHash(unsigned)).toBe(getInvoiceHash(new XMLDocument(forThem)));
  });

  it('computes the same invoice hash for our signed XML', () => {
    const { signedXml, invoiceHash } = signInvoice({ xml: unsigned, privateKeyPem: keys.privateKeyPem, certificatePem: cert.pem, signingTime: new Date() });
    expect(getInvoiceHash(new XMLDocument(signedXml))).toBe(invoiceHash);
  });

  it('produces a byte-identical QR TLV for the same inputs', () => {
    const ours = signInvoice({ xml: unsigned, privateKeyPem: keys.privateKeyPem, certificatePem: cert.pem, signingTime: new Date() });
    const info = certificateInfo(cert.pem);
    const theirs = generateQR({
      invoice_xml: new XMLDocument(forThem),
      digital_signature: ours.signatureValue,
      public_key: info.publicKeyDer,
      certificate_signature: info.signature,
    });
    expect(Object.keys(parseQrTlv(theirs))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(Buffer.from(ours.qr, 'base64').equals(Buffer.from(theirs, 'base64'))).toBe(true);
  });
});

describe('zatca-xml-js cross-check: certificate fields', () => {
  it.each([
    ['SDK sample certificate', SAMPLE_CERT_BODY],
    ['self-signed test certificate', certificateInfo(cert.pem).body],
  ])('%s: digest, issuer, serial, public key and signature agree', (_, body) => {
    const ours = certificateInfo(body);
    const theirs = getCertificateInfo(body);
    expect(ours.digest).toBe(theirs.hash);
    expect(ours.issuerName).toBe(theirs.issuer);
    expect(ours.serialNumber).toBe(theirs.serial_number);
    expect(ours.publicKeyDer.equals(Buffer.from(theirs.public_key))).toBe(true);
    expect(ours.signature.equals(Buffer.from(theirs.signature))).toBe(true);
  });
});
