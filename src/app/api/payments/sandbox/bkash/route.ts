import { NextResponse } from 'next/server';

/**
 * Local sandbox harness for bKash, used when `BKASH_APP_KEY` is unset.
 * Mirrors the behaviour of the real bKash hosted checkout: returns to
 * `/api/payments/bkash/success?paymentId=...&paymentID=sandbox_...&status=success`.
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
<title>bKash Sandbox</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 40px; max-width: 480px; margin: 0 auto; color: #111; background: #f7f7f9; }
  .card { background: white; padding: 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
  h1 { margin: 0 0 8px; font-size: 20px; color: #e2136e; }
  p { color: #555; line-height: 1.5; }
  a { display: inline-block; padding: 10px 16px; font-size: 14px; border-radius: 8px; text-decoration: none; margin-right: 8px; color: white; }
  .approve { background: #10b981; }
  .decline { background: #ef4444; }
  .cancel  { background: #6b7280; }
</style>
</head>
<body>
<div class="card">
  <h1>bKash sandbox</h1>
  <p>You're seeing this page because <code>BKASH_APP_KEY</code> is not configured. In production this would be the bKash hosted checkout.</p>
  <p>Choose an outcome to simulate:</p>
  <a class="approve" href="/api/payments/bkash/success?paymentId=${paymentId}&paymentID=sandbox_${paymentId}&status=success">Approve</a>
  <a class="decline" href="/api/payments/bkash/fail?paymentId=${paymentId}&paymentID=sandbox_${paymentId}&status=failure">Fail</a>
  <a class="cancel" href="/api/payments/bkash/cancel?paymentId=${paymentId}&paymentID=sandbox_${paymentId}&status=cancel">Cancel</a>
</div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
