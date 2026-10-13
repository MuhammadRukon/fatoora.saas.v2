import { NextResponse } from 'next/server';

/**
 * Local sandbox harness for SSLCommerz. We render a tiny HTML page
 * with two buttons - "Approve" / "Decline" - that POST back to our
 * normal `/api/payments/sslcommerz/success` (or `/fail`) handler with
 * a `val_id` prefixed `sandbox_` so the gateway parser knows to skip
 * remote validation.
 *
 * This is only reachable when `SSLCOMMERZ_STORE_ID` is unset.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentId = url.searchParams.get('paymentId');
  if (!paymentId) {
    return NextResponse.json({ error: 'Missing paymentId' }, { status: 400 });
  }
  const html = `<!DOCTYPE html>
<html>
<head>
<title>SSLCommerz Sandbox</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 40px; max-width: 480px; margin: 0 auto; color: #111; background: #f7f7f9; }
  .card { background: white; padding: 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
  h1 { margin: 0 0 8px; font-size: 20px; }
  p { color: #555; line-height: 1.5; }
  button { padding: 10px 16px; font-size: 14px; border-radius: 8px; border: none; cursor: pointer; margin-right: 8px; }
  .approve { background: #10b981; color: white; }
  .decline { background: #ef4444; color: white; }
</style>
</head>
<body>
<div class="card">
  <h1>SSLCommerz sandbox</h1>
  <p>You're seeing this page because <code>SSLCOMMERZ_STORE_ID</code> is not configured. In production this would be the real gateway page.</p>
  <p>Choose an outcome to simulate:</p>
  <form method="POST" action="/api/payments/sslcommerz/success">
    <input type="hidden" name="tran_id" value="${paymentId}" />
    <input type="hidden" name="val_id" value="sandbox_${paymentId}" />
    <input type="hidden" name="status" value="VALID" />
    <button class="approve" type="submit">Approve payment</button>
  </form>
  <form method="POST" action="/api/payments/sslcommerz/fail" style="margin-top: 12px;">
    <input type="hidden" name="tran_id" value="${paymentId}" />
    <input type="hidden" name="val_id" value="sandbox_${paymentId}" />
    <input type="hidden" name="status" value="FAILED" />
    <button class="decline" type="submit">Decline payment</button>
  </form>
</div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
