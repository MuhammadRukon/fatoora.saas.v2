import { generateKeyPairSync, sign } from 'node:crypto';
import { BitString, PrintableString, Sequence, Set, Utf8String } from 'asn1js';
import {
  AlgorithmIdentifier,
  Attribute,
  AttributeTypeAndValue,
  CertificationRequest,
  Extension,
  Extensions,
  GeneralName,
  GeneralNames,
  PublicKeyInfo,
  RelativeDistinguishedNames,
} from 'pkijs';

export type ZatcaEnvironment = 'SIMULATION' | 'PRODUCTION';

/** secp256k1 key pair (node:crypto; WebCrypto has no secp256k1). */
export function generateKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'secp256k1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}

// Certificate template name (MS OID) per environment: ZATCA staff, forum t/4028.
const TEMPLATE_NAME: Record<ZatcaEnvironment, string> = {
  SIMULATION: 'PREZATCA-Code-Signing',
  PRODUCTION: 'ZATCA-Code-Signing',
};

const OID = {
  C: '2.5.4.6',
  OU: '2.5.4.11',
  O: '2.5.4.10',
  CN: '2.5.4.3',
  SN: '2.5.4.4',
  UID: '0.9.2342.19200300.100.1.1',
  title: '2.5.4.12',
  registeredAddress: '2.5.4.26',
  businessCategory: '2.5.4.15',
  templateName: '1.3.6.1.4.1.311.20.2',
  subjectAltName: '2.5.29.17',
  extensionRequest: '1.2.840.113549.1.9.14',
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
};

// One AVA per RDN, like OpenSSL. pkijs would put all AVAs in a single multi-valued RDN ("C=SA+O=..."), so the Name
// is encoded by hand and decoded back so pkijs keeps these exact bytes.
const rdn = (pairs: [string, PrintableString | Utf8String][]) =>
  RelativeDistinguishedNames.fromBER(
    new Sequence({
      value: pairs.map(([type, value]) => new Set({ value: [new AttributeTypeAndValue({ type, value }).toSchema()] })),
    }).toBER(false),
  );
const utf8 = (value: string) => new Utf8String({ value });

export type CsrInput = {
  privateKeyPem: string;
  publicKeyPem: string;
  env: ZatcaEnvironment;
  commonName: string;
  serialNumber: string; // "1-<solution>|2-<model/version>|3-<device serial>"
  vatNumber: string;
  orgUnit: string;
  orgName: string;
  country?: string;
  functionalityMap?: string; // "TSCZ" flags, 1100 = standard + simplified
  registeredAddress: string;
  businessCategory: string;
};

/** PKCS#10 CSR per Security Features Standard 2.2.2, returned as base64 of the PEM (the /compliance payload). */
export function buildCsr(i: CsrInput): string {
  const csr = new CertificationRequest();
  csr.version = 0;
  csr.subject = rdn([
    [OID.C, new PrintableString({ value: i.country ?? 'SA' })],
    [OID.OU, utf8(i.orgUnit)],
    [OID.O, utf8(i.orgName)],
    [OID.CN, utf8(i.commonName)],
  ]);
  const spki = Buffer.from(i.publicKeyPem.replace(/-----[^-]+-----|\s/g, ''), 'base64');
  csr.subjectPublicKeyInfo = PublicKeyInfo.fromBER(spki);

  const san = rdn([
    [OID.SN, utf8(i.serialNumber)],
    [OID.UID, utf8(i.vatNumber)],
    [OID.title, utf8(i.functionalityMap ?? '1100')],
    [OID.registeredAddress, utf8(i.registeredAddress)],
    [OID.businessCategory, utf8(i.businessCategory)],
  ]);
  const extensions = new Extensions({
    extensions: [
      new Extension({
        extnID: OID.templateName,
        critical: false,
        extnValue: new PrintableString({ value: TEMPLATE_NAME[i.env] }).toBER(false),
      }),
      new Extension({
        extnID: OID.subjectAltName,
        critical: false,
        extnValue: new GeneralNames({ names: [new GeneralName({ type: 4, value: san })] }).toSchema().toBER(false),
      }),
    ],
  });
  csr.attributes = [new Attribute({ type: OID.extensionRequest, values: [extensions.toSchema()] })];

  csr.signatureAlgorithm = new AlgorithmIdentifier({ algorithmId: OID.ecdsaWithSha256 });
  csr.tbsView = new Uint8Array((csr.toSchema(true) as Sequence).valueBlock.value[0].toBER(false));
  const signature = sign('sha256', csr.tbsView, { key: i.privateKeyPem, dsaEncoding: 'der' });
  csr.signatureValue = new BitString({ valueHex: signature });

  const der = Buffer.from(csr.toSchema().toBER(false));
  const pem = `-----BEGIN CERTIFICATE REQUEST-----\n${der.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE REQUEST-----\n`;
  return Buffer.from(pem, 'utf8').toString('base64');
}
