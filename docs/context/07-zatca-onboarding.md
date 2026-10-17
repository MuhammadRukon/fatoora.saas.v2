# ZATCA onboarding and the Simulation gate

## Flow (`src/server/zatca-onboarding/onboarding.service.ts`)

`onboard(businessId, otp)` works on the business's EGS unit in its current `zatcaEnvironment`:

1. New or FAILED unit: generate a secp256k1 key, build the CSR, `POST /compliance` with the OTP. Stores `privateKeyEnc`, `csrPem`, `complianceRequestId`, `complianceCsidEnc`, `complianceSecretEnc`, `certificatePem`. Status `COMPLIANCE_ISSUED`.
2. Build, sign and send the 6 compliance documents (`src/server/zatca/compliance-docs.ts`): standard and simplified invoice, plus a credit and a debit note for each, ICV 1..6 chained from `PIH_SEED`. All must come back PASS or WARNING with zero errors.
3. `POST /production/csids`. Stores `productionCsidEnc`, `productionSecretEnc`, the production `certificatePem` and `certNotAfter`; resets `lastIcv = 0` and `lastInvoiceHash = PIH_SEED`. Status `ACTIVE`.

Failure handling: a ZATCA rejection (bad OTP, rejected document, auth error) sets `FAILED` with the error text in `lastError`; the user needs a new OTP and the next call starts again from step 1 on the same row. A transport failure (5xx, timeout) after step 1 leaves `COMPLIANCE_ISSUED`; the next call resumes at step 2 without an OTP.

Secrets: every credential is stored as `v1:<iv>:<tag>:<ciphertext>` (AES-256-GCM, key `ZATCA_ENCRYPTION_KEY`, `src/server/zatca/crypto-box.ts`). Nothing in the API returns them, and the gateway logger redacts `Authorization` and `OTP`.

## Simulation gate (AC6.4): `npm run zatca:sim-check`

Needs a real Simulation OTP, so it is run by a person, not CI.

1. Run the app (`npm run dev`), sign in, and save a business at `/app/business` with the VAT number registered in the Fatoora portal and environment SIMULATION. The business must not already have a Simulation EGS.
2. In the Fatoora portal (Simulation) generate an OTP (6 digits, valid 1 hour, single use).
3. `npm run zatca:sim-check -- --otp 123456` (add `--business-id <id>` for a business other than the first one).
4. Expected: 6 rows, each `PASS`, `0` errors, `0` warnings, final line `PASS`, exit code 0. Exit 1 means ZATCA reported a problem (messages are printed under each row); exit 2 is a usage error.
5. Raw responses are in `tools/zatca-sim-recordings/<timestamp>/` (gitignored, the `secret` field is blanked). Send those files back to fix any rule the Phase 5 library got wrong.

The script stops before the production CSID and deletes the throwaway EGS row, so the same business can then be onboarded in the app (AC6.5).

Offline check: `npm run zatca:sim-check -- --dry-run` builds and signs the 6 documents with a self-signed test certificate, verifies them locally and prints the invoice hashes. No network, no database.

## Assumptions the Simulation response must confirm

- Response field names: `requestID`, `binarySecurityToken`, `secret`, and `validationResults.{infoMessages,warningMessages,errorMessages}`.
- Seller name on documents is `nameAr`; CSR `O` is `nameEn`, `OU` is `<city> Branch`, registered address is `<building> <street>, <district>, <city>`.
- The same Fatoora portal URL serves Simulation and Production.
- `/compliance/invoices` accepts the same body as reporting: `{invoiceHash, uuid, invoice}`.

## Issuing documents (Phase 7)

`src/server/documents/issuance.service.ts`. `issue` runs one transaction: lock the active EGS row, lock the draft, check issue-time rules (standard buyer complete, original issued and same type, supply date not in the future), snapshot seller and buyer, `allocateNumber`, new UUID, `icv = lastIcv + 1`, `pih = lastInvoiceHash`, build and sign (key and cert decrypted in memory), persist the document as ISSUED with `submissionStatus PENDING_RETRY` and advance the EGS chain. Only then `submit` runs, outside the transaction: SIMPLIFIED is reported, STANDARD is cleared (a 303 falls back to reporting). Outcomes: PASS/WARNING -> REPORTED or CLEARED (cleared XML and its QR stored), 400 -> REJECTED (final; the chain stays advanced; "Create corrected copy" makes a new draft), network/5xx -> stays PENDING_RETRY, 401/403 -> stays PENDING_RETRY and sets the EGS `lastError` ("re-onboard required"). The document-to-XML mapping is `src/server/documents/zatca-mapper.ts`.

## AC7.11: live Simulation run (user)

Prerequisite: the EGS is onboarded in Simulation (AC6.5). Needs a real Simulation OTP, so it cannot run in CI.

1. Create a customer with a complete Saudi address and VAT number (street, building number, district, city, postal code).
2. Issue a SIMPLIFIED invoice (any line, 15%): open the draft, click "Issue to ZATCA", confirm. Expect status Reported with no warnings.
3. Create a simplified credit note against it (New > Credit note, pick the invoice, give a reason) and issue it. Expect Reported.
4. Issue a STANDARD invoice to the customer from step 1 (set a supply date on or before today). Expect Cleared. Then a standard debit note against it. Expect Cleared.
5. On the simplified invoice open Print view, scan the QR with the ZATCA VAT app: the total must equal the invoice total (tag 4). Check the Simulation watermark is shown.
6. Force a rejection: create a customer with an invalid but well-formed VAT number (for example change the last digit so the check fails), insert it directly with Prisma Studio (`npm run db:studio`), and issue a STANDARD invoice to it. Expect Rejected with ZATCA's messages shown. Then issue another valid simplified invoice: it must be accepted (PIH after a rejection uses the rejected document's hash).
7. Pass criteria: documents of steps 2-4 end Reported or Cleared with `hasWarnings` false; step 6's follow-up document is accepted. Record any warning or error text and send it back (the raw response is in `Document.zatcaResponse`).

Cron check (optional): `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/zatca-retry` returns `{"processed": n}`; without the header it returns 401.

Assumptions the Simulation run must confirm: the clearance response carries `clearedInvoice` (base64 XML) and the cleared XML contains the QR as `cbc:EmbeddedDocumentBinaryObject` under `AdditionalDocumentReference` `QR`; a 200 on clearance means CLEARED; a 202 means accepted with warnings; the seller registration name (Arabic) and a buyer name taken from `name`.

## Sandbox findings (`npm run zatca:sandbox-check`, dev-only)

The developer-portal sandbox (`/e-invoicing/developer-portal`, not a product environment) needs no taxpayer credentials: CSR template `TSTZATCA-Code-Signing`, any well-formed VAT (15 digits, starts and ends with 3), OTP `123345` (accepted, verified 2026-10-14). The script (`scripts/zatca-sim-check.ts --sandbox`, no DB) uses the synthetic taxpayer VAT 399999999900003, writes recordings to `tools/zatca-sim-recordings/sandbox-<ts>/` and exits non-zero on any error or warning. `createZatcaClient('SANDBOX')` and `buildCsr({env: 'SANDBOX'})` exist only for it (`ZatcaDevEnvironment`).

Result (2026-10-14): all 6 compliance documents PASS, 0 errors, 0 warnings, only the info `XSD_ZATCA_VALID`. No library fix was needed.

Sandbox is a real validator, not a stub. Mutations of a valid simplified invoice were rejected (HTTP 400):
- wrong `invoiceHash` in the body: `invalid-invoice-hash` + `invoiceHash_QRCODE_INVALID`
- altered signature value: `INVOICE_SIGNATURE_VALUE_QRCODE_INVALID`
- altered QR (tag 1): `sellerName_QRCODE_INVALID`; QR removed: `BR-KSA-27` (warning) + `BR-KSA-28/30`, `QRCODE_INVALID`
- edited amount: `BR-CO-16` (warning) + `invalid-invoice-hash`; removed ProfileID: `BR-KSA-EN16931-01`
- non-ZATCA XML: HTTP 400 body `{"raw":"Invalid Request"}` (not JSON)

Not checked by the sandbox: ICV/PIH chain, invoice storage (resubmitting the same document is accepted again, so DUPLICATE can not be provoked), real certificate chain.

Response shapes (field names and types as seen; `secret` blanked in recordings):
- `POST /compliance` 200: `{requestID: number, dispositionMessage: "ISSUED", binarySecurityToken: string, secret: string, errors: null}`. `requestID` is a JSON number (the parser's `field()` stringifies numbers).
- `POST /compliance/invoices` 200: `{validationResults: {infoMessages[], warningMessages[], errorMessages[], status}, reportingStatus: null, clearanceStatus: "CLEARED", qrSellertStatus: null, qrBuyertStatus: null}` (the sandbox answers "CLEARED" for a simplified invoice too, and "REPORTED" when it is simplified and reporting; trust HTTP status + `validationResults`). Each message: `{type, code, category, message, status}`.
- `POST /production/csids` 200: `{requestID: number, tokenType, dispositionMessage: "ISSUED", binarySecurityToken, secret}`. Works with the compliance token in the sandbox.
- `POST /invoices/reporting/single` 200: `{validationResults, reportingStatus: "REPORTED"}`.
- `POST /invoices/clearance/single` 200: `{validationResults, clearanceStatus: "CLEARED", clearedInvoice: <base64 XML>}`. `extractQrFromXml` reads the QR from `clearedInvoice` (tags 1-9 present); ZATCA writes `mimeCode="text/plain"` on `EmbeddedDocumentBinaryObject`.
- Documents signed by the compliance certificate were accepted by reporting and clearance with the production CSID (the sandbox does not check the chain).
