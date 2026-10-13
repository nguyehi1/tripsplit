import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import {
  ANON_RETENTION_DAYS,
  MIN_AGE,
  OPERATOR_NAME,
  PRIVACY_EMAIL,
  REQUEST_RESPONSE_DAYS,
} from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy — Splitiful" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Splitiful helps friend groups split trip expenses. This page explains what we collect, why,
        who processes it, how long we keep it, and the choices and rights you have.
      </p>

      <h2>Who we are</h2>
      <p>
        Splitiful is operated by {OPERATOR_NAME}, an individual. We decide how and why your
        data is used (in privacy-law terms, we are the &ldquo;controller&rdquo; or
        &ldquo;business&rdquo;). Contact: <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          Display name. You have one display name per account, shown to the members of every trip you
          belong to. When you join or create a trip we use the name you already have; if you change
          it, it changes on all of your trips, including past ones. Your email is never shown to
          other members.
        </li>
        <li>
          Email address, only if you choose to confirm one (to sign back in and receive a trip link).
          It is never shown to other trip members.
        </li>
        <li>
          Trip details: name, location (text you type, such as a destination; we do not read your
          device&rsquo;s location), dates, and members.
        </li>
        <li>Expenses: descriptions, amounts, who paid, who shares them, and shopping-list items.</li>
        <li>
          Names of other people an organizer adds to a trip (for example someone without the app).
          Please only add people who are fine with that. If you use Invite by email, the address you
          type is used only in your browser to open your own mail app; we do not receive or store
          it, and nothing else you type there reaches us either.
        </li>
        <li>Feedback you submit, if any (a rating and an optional comment), linked to your account and not to any particular trip.</li>
        <li>
          Technical data: your IP address (used for abuse rate limiting and present in standard
          hosting logs), and page-view, performance and usage-event data from Vercel Analytics and
          Speed Insights. We do not put names, emails or amounts into analytics events.
        </li>
      </ul>
      <p>
        We do not ask for payment details, government IDs, precise location, or other sensitive
        categories of data, and ask you not to put them into trip names, expense descriptions or
        comments.
      </p>

      <h2>Accounts without an email</h2>
      <p>
        You can start a trip without giving an email. We create a private, anonymous session in your
        browser so the trip is yours. If you never confirm an email and stop using the app for{" "}
        {ANON_RETENTION_DAYS} days, that session and the trips only you belong to are deleted
        automatically. (Anonymous accounts that paid an expense, or that organize a trip other people
        belong to, are not deleted automatically so other members&rsquo; balances stay correct; you can
        ask us to delete them, see below.)
      </p>

      <h2>Why we use your data</h2>
      <p>If you are in the EU, UK or a similar region, these are the legal bases we rely on:</p>
      <ul>
        <li>
          Providing the service you asked for (contract): your name, email, trips and expenses, so
          you can sign in, track costs and see who owes whom, and trip emails.
        </li>
        <li>
          Our legitimate interests: keeping the service secure and preventing abuse (IP-based rate
          limiting), and understanding and improving performance and usage (analytics). You can
          object to this, see &ldquo;Your rights&rdquo;.
        </li>
        <li>Legal obligations: where the law requires us to keep or disclose something.</li>
        <li>Consent: where we ask for it, and you can withdraw it at any time.</li>
      </ul>
      <p>
        We do not use your email for anything beyond signing in and trip emails, and we do not make
        automated decisions about you.
      </p>

      <h2>Who processes your data</h2>
      <ul>
        <li>Supabase: database and authentication (including sending sign-in codes).</li>
        <li>Vercel: hosting, analytics and performance measurement.</li>
        <li>Resend: sends trip-link emails (receives your email address and the trip name).</li>
        <li>Upstash: rate limiting (receives IP addresses; counters are short-lived).</li>
      </ul>
      <p>
        These providers process data on our behalf and only to provide their service to us. We do not
        sell your personal information, we do not share it for cross-context behavioral advertising,
        and we do not use it for advertising. Other members of a trip can see what you enter on that
        trip (your display name, expenses and shares), as that is the point of the app. We may also
        disclose data if the law requires it.
      </p>

      <h2>International transfers</h2>
      <p>
        Our providers are largely based in, or operate infrastructure in, the United States, so your
        data may be transferred to and processed outside your country, including outside the
        EU/UK. Where the law requires a transfer safeguard, we rely on the mechanisms our providers
        offer, such as standard contractual clauses.
      </p>

      <h2>Cookies and local storage</h2>
      <ul>
        <li>
          Sign-in session: Supabase sets cookies (and similar browser storage) that keep you signed
          in, including your anonymous session if you never add an email. These are strictly necessary
          for the app to work.
        </li>
        <li>
          Remembered email: if you sign in with an email, we save it in your browser&rsquo;s local
          storage to prefill the sign-in form next time. It stays on your device; you can clear it
          with the option on the sign-in screen or by clearing site data.
        </li>
        <li>
          Draft expense: an unfinished expense may be held in your browser&rsquo;s session storage until
          you finish it or close the tab.
        </li>
        <li>
          Analytics: Vercel Analytics and Speed Insights measure page views, performance and the
          usage events above. We do not use advertising or cross-site tracking cookies. There is no
          in-app analytics opt-out today; you can block it with your browser or an extension.
        </li>
      </ul>

      <h2>Retention</h2>
      <ul>
        <li>
          Trip and expense data is kept while the trip exists and until you ask us to delete it.
        </li>
        <li>
          Unverified anonymous accounts are deleted after {ANON_RETENTION_DAYS} days of inactivity
          (subject to the exceptions above).
        </li>
        <li>
          Rate-limiting records (which can include your IP address) are deleted within about a day.
          Hosting logs are kept by our providers under their own retention schedules.
        </li>
        <li>
          After a deletion request, we remove or anonymize your data as described below. Backups and
          provider logs may keep copies for a limited time until they expire.
        </li>
      </ul>

      <h2>Your rights</h2>
      <p>
        Depending on where you live (for example under the GDPR/UK GDPR or the California Consumer
        Privacy Act), you may have the right to:
      </p>
      <ul>
        <li>Access the personal data we hold about you and get a copy of it.</li>
        <li>Correct data that is wrong or incomplete (you can also edit your own entries in the app).</li>
        <li>Erase (delete) your data.</li>
        <li>Receive your data in a portable, machine-readable format (we provide JSON).</li>
        <li>Object to, or ask us to restrict, processing based on our legitimate interests.</li>
        <li>Withdraw consent where we rely on it.</li>
        <li>
          Know what we collect and disclose, and opt out of the sale or sharing of personal
          information. We do not sell or share it, so there is nothing to opt out of.
        </li>
        <li>
          Not be treated worse for exercising these rights. We will not deny you the service, charge a
          different price, or lower its quality because you made a request.
        </li>
        <li>
          Complain to your data protection authority or regulator (in the EU/UK, your local
          supervisory authority; in the US, your state attorney general). We would appreciate the
          chance to fix things first.
        </li>
      </ul>
      <p>
        To use any of these, email <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> from the
        address on your account (or, for an account without an email, tell us the trip link and your
        display name). We may ask you to confirm it is you before acting. We aim to respond within{" "}
        {REQUEST_RESPONSE_DAYS} days. An authorized agent may make a request on your behalf if we can
        verify their authority.
      </p>
      <p>
        Because expenses are shared with the rest of the trip, deleting your account may replace your
        name on shared expenses with &ldquo;Former member&rdquo; and keep the amounts, unnamed, so
        other members&rsquo; balances stay correct. Your email and sign-in identity are removed.
      </p>

      <h2>Security</h2>
      <p>
        We use reasonable technical and organizational measures to protect your data, including
        encrypted connections (HTTPS), per-user access rules in our database, and rate limiting. No
        online service is perfectly secure. If a breach affects your personal data, we will notify
        you and any regulator as the law requires.
      </p>

      <h2>Children</h2>
      <p>
        Splitiful is not directed at children under {MIN_AGE}, and we do not knowingly collect their
        data. If you believe a child has given us data, email us and we will delete it.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy materially, we will update the &ldquo;Last updated&rdquo; date above
        and, where appropriate, tell you in the app or by email.
      </p>

      <h2>Contact</h2>
      <p>
        {OPERATOR_NAME}
        <br />
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>
      </p>
    </LegalPage>
  );
}
