import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Cryptech',
  description:
    'How Cryptech Ltd collects, uses, and protects your personal information when you shop with us.',
};

export default function PrivacyPolicyPage() {
  return (
    <article className="mx-auto max-w-3xl py-10 text-sm sm:text-base [&>h1]:text-2xl [&>h1]:sm:text-3xl [&>h1]:font-semibold [&>h1]:mb-2 [&>h2]:text-lg [&>h2]:sm:text-xl [&>h2]:font-semibold [&>h2]:mt-8 [&>h2]:mb-3 [&>p]:leading-7 [&>p]:mb-4 [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-4 [&>ul]:space-y-1">
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground">Effective date: 18 July 2026</p>
      <p>
        This policy explains what personal information Cryptech Ltd (&quot;we&quot;,
        &quot;us&quot;) collects when you use this website, why we collect it, and how we handle
        it.
      </p>
      <h2>Information we collect</h2>
      <ul>
        <li>Account details: name, email address, phone number, and a hashed password.</li>
        <li>Order details: shipping addresses, ordered items, and payment method.</li>
        <li>
          Payment references: transaction identifiers returned by our payment partners. We never
          see or store your card number, PIN, or mobile-wallet credentials.
        </li>
        <li>Reviews, warranty claims, and messages you submit through the site.</li>
        <li>
          Technical data needed to run the service securely, such as IP addresses used for abuse
          prevention and rate limiting.
        </li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To process and deliver your orders and keep you informed about their status.</li>
        <li>To provide account features such as order history, reviews, and warranty claims.</li>
        <li>To send transactional emails (order confirmations, status updates, password resets).</li>
        <li>To prevent fraud and abuse of the service.</li>
      </ul>
      <p>We do not sell your personal information, and we do not send marketing email without your consent.</p>
      <h2>Third parties we share data with</h2>
      <ul>
        <li>
          Payment processing: SSLCommerz and bKash receive the details required to process your
          payment.
        </li>
        <li>Image hosting: product and site images are served via Cloudinary.</li>
        <li>Sign-in: if you choose to sign in with Google, Google shares your name and email with us.</li>
        <li>Email delivery: transactional emails are delivered through our email provider.</li>
        <li>Delivery partners: couriers receive your name, address, and phone number to deliver orders.</li>
      </ul>
      <h2>Cookies</h2>
      <p>
        We use cookies strictly to keep you signed in and to remember your cart. We do not use
        third-party advertising cookies.
      </p>
      <h2>Data retention and security</h2>
      <p>
        Order records are kept as long as required for warranty service, accounting, and legal
        obligations. Passwords are stored only as salted hashes. Access to customer data is limited
        to authorized staff.
      </p>
      <h2>Your choices</h2>
      <p>
        You can update your address book from your account, and request account deletion or a copy
        of your data by contacting us (see our{' '}
        <a className="text-primary hover:underline" href="/contact">
          contact page
        </a>
        ).
      </p>
      <h2>Contact</h2>
      <p>
        Cryptech Ltd, Tali Office Road, Hazaribagh, Dhaka-1209 —{' '}
        <a className="text-primary hover:underline" href="mailto:muhammad.rukon242@gmail.com">
          muhammad.rukon242@gmail.com
        </a>
      </p>
    </article>
  );
}
