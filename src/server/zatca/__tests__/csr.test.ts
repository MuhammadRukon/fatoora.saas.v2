import 'reflect-metadata';
import { createPublicKey, verify } from 'node:crypto';
import { Pkcs10CertificateRequest, SubjectAlternativeNameExtension } from '@peculiar/x509';
import { fromBER, PrintableString, Sequence } from 'asn1js';
import { describe, expect, it } from 'vitest';
import { buildCsr, generateKeyPair } from '../csr';

const input = {
  commonName: 'Test Co-EGS',
  serialNumber: '1-Fatoora|2-1.0|3-6f4d20e0-6bfe-4a80-9389-7dabe6620f12',
  vatNumber: '399999999900003',
  orgUnit: 'Riyadh Branch',
  orgName: 'شركة الاختبار',
  registeredAddress: 'RRRD2929',
  businessCategory: 'Retail',
};

function parse(csrB64: string) {
  const pem = Buffer.from(csrB64, 'base64').toString('utf8');
  expect(pem).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----\n[\s\S]+\n-----END CERTIFICATE REQUEST-----\n?$/);
  return { pem, csr: new Pkcs10CertificateRequest(pem) };
}

describe('generateKeyPair', () => {
  it('creates a secp256k1 key pair as PEM', () => {
    const { privateKeyPem, publicKeyPem } = generateKeyPair();
    expect(privateKeyPem).toContain('PRIVATE KEY');
    expect(createPublicKey(publicKeyPem).asymmetricKeyDetails?.namedCurve).toBe('secp256k1');
  });
});

describe('buildCsr (AC5.5)', () => {
  const keys = generateKeyPair();

  it.each([
    ['SIMULATION', 'PREZATCA-Code-Signing'],
    ['PRODUCTION', 'ZATCA-Code-Signing'],
    ['SANDBOX', 'TSTZATCA-Code-Signing'],
  ] as const)('%s CSR carries the %s template, the SAN dirName and a valid self-signature', (env, template) => {
    const { csr } = parse(buildCsr({ ...keys, ...input, env }));

    expect(createPublicKey({ key: Buffer.from(csr.publicKey.rawData), format: 'der', type: 'spki' }).asymmetricKeyDetails?.namedCurve).toBe('secp256k1');
    expect(csr.signatureAlgorithm).toMatchObject({ name: 'ECDSA', hash: { name: 'SHA-256' } });
    expect(csr.subject).toBe(`C=SA, OU=${input.orgUnit}, O=${input.orgName}, CN=${input.commonName}`);

    const tmpl = csr.getExtension('1.3.6.1.4.1.311.20.2')!;
    const tmplValue = fromBER(tmpl.value).result;
    expect(tmplValue).toBeInstanceOf(PrintableString);
    expect((tmplValue as PrintableString).valueBlock.value).toBe(template);

    const san = new SubjectAlternativeNameExtension(csr.getExtension('2.5.29.17')!.rawData);
    const dn = san.names.items[0];
    expect(dn.type).toBe('dn');
    // @peculiar/x509 prints SN, T (title) and bare OIDs for UID (0.9.2342.19200300.100.1.1),
    // registeredAddress (2.5.4.26) and businessCategory (2.5.4.15).
    expect(dn.value).toBe(
      `SN=${input.serialNumber}, 0.9.2342.19200300.100.1.1=${input.vatNumber}, T=1100, 2.5.4.26=${input.registeredAddress}, 2.5.4.15=${input.businessCategory}`,
    );

    // Proof of possession: the CSR signature verifies over its CertificationRequestInfo with its own key.
    const der = Buffer.from(csr.rawData);
    const [info, , sig] = (fromBER(new Uint8Array(der)).result as Sequence).valueBlock.value;
    const signature = Buffer.from((sig as unknown as { valueBlock: { valueHexView: Uint8Array } }).valueBlock.valueHexView);
    expect(verify('sha256', Buffer.from(info.valueBeforeDecodeView), createPublicKey(keys.publicKeyPem), signature)).toBe(true);
  });
});
