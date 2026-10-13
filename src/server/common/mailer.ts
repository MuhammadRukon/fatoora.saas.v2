/**
 * Transactional email via the Resend HTTP API (plain fetch, no SDK).
 *
 * Same degraded-mode idiom as the payment providers: when
 * `RESEND_API_KEY` / `EMAIL_FROM` are missing the mailer logs and
 * returns instead of throwing, so local/dev/test environments work
 * without an email account. Sends are always fire-and-forget side
 * effects — callers must invoke this AFTER their DB transaction has
 * committed and never let a failure here fail the request
 * (`sendMail` never rejects).
 */

import { formatBDT } from '@/server/common/money';

import { log } from './logger';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface MailContent {
  subject: string;
  html: string;
}

function getMailerConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

/** True when email can actually be delivered (used for dev fallbacks). */
export function mailerConfigured(): boolean {
  return getMailerConfig() !== null;
}

export async function sendMail(to: string | null | undefined, content: MailContent): Promise<void> {
  if (!to) {
    log.info('mailer.skipped', { reason: 'no recipient', subject: content.subject });
    return;
  }
  const config = getMailerConfig();
  if (!config) {
    log.info('mailer.skipped', { reason: 'not configured', to, subject: content.subject });
    return;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: config.from, to, subject: content.subject, html: content.html }),
    });
    if (!res.ok) {
      log.error('mailer.send_failed', { to, subject: content.subject, status: res.status });
      return;
    }
    log.info('mailer.sent', { to, subject: content.subject });
  } catch (err) {
    log.error('mailer.send_failed', { to, subject: content.subject, error: String(err) });
  }
}

/* ------------------------------------------------------------------ */
/* Email content builders — plain HTML, no template engine.            */
/* ------------------------------------------------------------------ */

function layout(title: string, bodyHtml: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <h2 style="margin:24px 0 16px">${title}</h2>
  ${bodyHtml}
  <p style="margin-top:32px;font-size:12px;color:#777">Cryptech Ltd &middot; Tali Office Road, Hazaribagh, Dhaka-1209</p>
</div>`;
}

export function verificationEmail(code: string, verifyUrl: string): MailContent {
  return {
    subject: 'Verify your Cryptech account',
    html: layout(
      'Verify your email',
      `<p>Welcome to Cryptech! Enter this code on the verification page to activate your account:</p>
<p style="margin:24px 0;font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>
<p>Or click the button below to verify instantly:</p>
<p style="margin:24px 0"><a href="${verifyUrl}" style="background:#111;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px">Verify my email</a></p>
<p>This code and link expire in 30 minutes. If you didn't create an account, you can safely ignore this email.</p>`,
    ),
  };
}

export function passwordResetEmail(resetUrl: string): MailContent {
  return {
    subject: 'Reset your Cryptech password',
    html: layout(
      'Reset your password',
      `<p>We received a request to reset your password. Click the button below to choose a new one. This link expires soon and can only be used once.</p>
<p style="margin:24px 0"><a href="${resetUrl}" style="background:#111;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px">Reset password</a></p>
<p>If the button doesn't work, copy this link into your browser:<br/><a href="${resetUrl}">${resetUrl}</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>`,
    ),
  };
}

export function passwordChangedEmail(): MailContent {
  return {
    subject: 'Your Cryptech password was changed',
    html: layout(
      'Your password was changed',
      `<p>The password for your Cryptech account was just changed.</p>
<p>If you made this change, no action is needed. If you did <strong>not</strong> change your password, reset it immediately and contact us — someone may have access to your account.</p>
<p style="margin:24px 0"><a href="${(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/forgot-password" style="background:#111;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px">Reset my password</a></p>`,
    ),
  };
}

export function orderConfirmationEmail(order: {
  orderNumber: string;
  totalCents: number;
}): MailContent {
  return {
    subject: `Order ${order.orderNumber} received`,
    html: layout(
      'Thanks for your order!',
      `<p>We've received your order <strong>${order.orderNumber}</strong> for a total of <strong>${formatBDT(order.totalCents)}</strong>.</p>
<p>You can track its progress from the Orders section of your account. We'll email you again when the status changes.</p>`,
    ),
  };
}

export function paymentResultEmail(order: { orderNumber: string; totalCents: number }, succeeded: boolean): MailContent {
  if (succeeded) {
    return {
      subject: `Payment received for order ${order.orderNumber}`,
      html: layout(
        'Payment received',
        `<p>Your payment of <strong>${formatBDT(order.totalCents)}</strong> for order <strong>${order.orderNumber}</strong> was successful. Your order is now confirmed.</p>`,
      ),
    };
  }
  return {
    subject: `Payment not completed for order ${order.orderNumber}`,
    html: layout(
      'Payment not completed',
      `<p>Your payment for order <strong>${order.orderNumber}</strong> did not complete, and any reserved stock has been released.</p>
<p>You can retry the payment from your order page, or place the order again.</p>`,
    ),
  };
}

export function orderStatusEmail(order: { orderNumber: string }, status: string): MailContent {
  const messages: Record<string, string> = {
    CONFIRMED: 'has been confirmed and will be processed shortly.',
    PROCESSING: 'is being prepared for shipment.',
    SHIPPED: 'has been shipped and is on its way.',
    DELIVERED: 'has been delivered. Thank you for shopping with us!',
    CANCELLED: 'has been cancelled. Any reserved stock has been released.',
  };
  const detail = messages[status] ?? `status changed to ${status}.`;
  return {
    subject: `Order ${order.orderNumber} ${status.toLowerCase()}`,
    html: layout(
      'Order update',
      `<p>Your order <strong>${order.orderNumber}</strong> ${detail}</p>
<p>You can view details anytime from the Orders section of your account.</p>`,
    ),
  };
}
