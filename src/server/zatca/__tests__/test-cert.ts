import { sign } from 'node:crypto';
import { BitString, Integer, PrintableString, Sequence, Set, Utf8String } from 'asn1js';
import { AlgorithmIdentifier, AttributeTypeAndValue, Certificate, PublicKeyInfo, RelativeDistinguishedNames } from 'pkijs';
import { toCertificatePem } from '../certificate';

const ECDSA_SHA256 = '1.2.840.10045.4.3.2';

// DER order DC=local, DC=gov, CN=...: ZATCA-style issuer, printed reversed in xades:X509IssuerName.
const issuerName = () =>
  RelativeDistinguishedNames.fromBER(
    new Sequence({
      value: [
        ['0.9.2342.19200300.100.1.25', 'local'],
        ['0.9.2342.19200300.100.1.25', 'gov'],
        ['2.5.4.3', 'Fatoora Test CA'],
      ].map(([type, v]) => new Set({ value: [new AttributeTypeAndValue({ type, value: new Utf8String({ value: v }) }).toSchema()] })),
    }).toBER(false),
  );

/** Self-signed secp256k1 certificate standing in for a ZATCA CSID in offline tests. */
export function selfSignedCertificate(keys: { privateKeyPem: string; publicKeyPem: string }) {
  const cert = new Certificate();
  cert.version = 2;
  cert.serialNumber = new Integer({ valueHex: Buffer.from('6f00004a2c1bd3e9a1b2c3d4e5f6071829', 'hex') });
  cert.issuer = issuerName();
  cert.subject = RelativeDistinguishedNames.fromBER(
    new Sequence({ value: [new Set({ value: [new AttributeTypeAndValue({ type: '2.5.4.6', value: new PrintableString({ value: 'SA' }) }).toSchema()] })] }).toBER(false),
  );
  cert.notBefore.value = new Date('2026-01-01T00:00:00Z');
  cert.notAfter.value = new Date('2031-01-01T00:00:00Z');
  cert.subjectPublicKeyInfo = PublicKeyInfo.fromBER(Buffer.from(keys.publicKeyPem.replace(/-----[^-]+-----|\s/g, ''), 'base64'));
  cert.signature = new AlgorithmIdentifier({ algorithmId: ECDSA_SHA256 });
  cert.signatureAlgorithm = new AlgorithmIdentifier({ algorithmId: ECDSA_SHA256 });
  cert.tbsView = new Uint8Array(cert.encodeTBS().toBER(false));
  cert.signatureValue = new BitString({ valueHex: sign('sha256', cert.tbsView, { key: keys.privateKeyPem, dsaEncoding: 'der' }) });
  const body = Buffer.from(cert.toSchema().toBER(false)).toString('base64');
  return {
    pem: toCertificatePem(body),
    issuerName: 'CN=Fatoora Test CA, DC=gov, DC=local',
    serialNumber: BigInt('0x6f00004a2c1bd3e9a1b2c3d4e5f6071829').toString(10),
  };
}
