import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { DISPUTE_VENUE, GOVERNING_LAW, MIN_AGE, OPERATOR_NAME, PRIVACY_EMAIL } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service — Splitiful" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These Terms of Service are an agreement between you and {OPERATOR_NAME} (&ldquo;we&rdquo;), who
        operates Splitiful. By using Splitiful, you agree to these terms. If you don&rsquo;t agree,
        please don&rsquo;t use Splitiful.
      </p>

      <h2>What Splitiful is</h2>
      <p>
        A tool for tracking shared trip expenses and working out who owes whom. It does not move money,
        hold funds, or provide financial, tax or legal advice. Settling up happens between you and
        your friends, outside the app.
      </p>

      <h2>Who can use it</h2>
      <p>
        You must be at least {MIN_AGE} years old, and old enough under your local law to agree to
        these terms (or have a parent or guardian do so). If you use Splitiful on behalf of a group or
        organization, you confirm you may do so.
      </p>

      <h2>Your use</h2>
      <ul>
        <li>You are responsible for the accuracy of what you and your group enter.</li>
        <li>Don&rsquo;t use the app unlawfully, to harass others, or to probe, overload or break it.</li>
        <li>Don&rsquo;t scrape it, attempt to access other people&rsquo;s trips, or get around its limits.</li>
        <li>Only add other people&rsquo;s names if they&rsquo;re fine with it.</li>
        <li>
          Invite by email opens a message in your own email app. You send it, from your own account,
          so only invite people you know who would expect to hear from you about the trip. Don&rsquo;t
          use it to send spam or bulk or unsolicited messages. You are responsible for the messages
          you send. Splitiful does not send the message and does not receive or keep the address.
        </li>
        <li>Anyone with a trip&rsquo;s invite link can request to join it, so share links carefully.</li>
        <li>Keep your sign-in codes and any device you are signed in on to yourself.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You keep ownership of what you enter (names, trip details, expenses, feedback). You give us a
        non-exclusive, worldwide, royalty-free license to host, store, copy and display it to the
        members of your trip, and to process it as needed, only to run and improve the service. You
        confirm you have the right to enter it. We own the Splitiful app, its design, and its
        software; these terms do not give you any rights in them beyond using the service. If you
        send us feedback, we may use it without owing you anything.
      </p>

      <h2>Availability and changes</h2>
      <p>
        Splitiful is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties
        of any kind, to the extent the law allows, including that it will be uninterrupted,
        error-free, or that balances or calculations will be accurate for your purposes. It may
        change, be interrupted, or be discontinued.
      </p>

      <h2>Termination</h2>
      <p>
        You can stop using Splitiful at any time, and ask us to delete your account as described in
        the <Link href="/privacy">Privacy Policy</Link>. We may suspend or end your access, or remove
        content, if you break these terms, put the service or other people at risk, or the law
        requires it, and we may discontinue the service. Sections that by their nature should
        survive (content license for data shared with other members, ownership, disclaimers,
        liability, indemnity, governing law) survive termination.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, we are not liable for indirect, incidental, special or
        consequential losses, lost profits or data, or for disputes between trip members over amounts
        owed or what was spent, and our total liability for any claim relating to Splitiful is limited
        to the greater of the amount you paid us in the 12 months before the claim (Splitiful is
        currently free, so that may be zero) or USD 50. Nothing here limits liability that cannot
        legally be limited, including for fraud, or for death or personal injury caused by negligence,
        or any rights you have as a consumer that cannot be waived.
      </p>

      <h2>Indemnity</h2>
      <p>
        To the extent the law allows, you agree to cover reasonable losses we suffer from a claim by
        someone else arising out of content you enter that you had no right to enter, or your breach of
        these terms or misuse of the service.
      </p>

      <h2>Governing law and disputes</h2>
      <p>
        These terms are governed by the laws of {GOVERNING_LAW}, without regard to conflict-of-law
        rules. Please email us first at <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> and
        give us 30 days to try to resolve a dispute informally. If that fails, the courts of{" "}
        {DISPUTE_VENUE} have jurisdiction, except that mandatory consumer-protection laws where you
        live may let you bring a claim in your local courts, and they still apply to you.
      </p>

      <h2>General</h2>
      <ul>
        <li>
          Entire agreement: these terms and the Privacy Policy are the whole agreement between you and
          us about Splitiful and replace any earlier understanding.
        </li>
        <li>
          Severability: if a part of these terms is found unenforceable, the rest stays in effect.
        </li>
        <li>
          No waiver: if we don&rsquo;t enforce something right away, we haven&rsquo;t given up the
          right to later.
        </li>
        <li>
          You may not transfer your rights under these terms without our consent. We may transfer ours
          as part of a merger, sale or similar change, in which case we will let you know.
        </li>
      </ul>

      <h2>Privacy</h2>
      <p>
        See our <Link href="/privacy">Privacy Policy</Link> for how data is handled and how to delete
        your account.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms and will change the &ldquo;Last updated&rdquo; date above when we do.
        If a change is material, we will tell you in the app or by email where we can. Continuing to
        use Splitiful after a change means you accept it. Questions:{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
