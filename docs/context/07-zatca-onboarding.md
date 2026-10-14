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
