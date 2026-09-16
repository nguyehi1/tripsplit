import { Resend } from "resend";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "Splitiful <noreply@splitiful.app>";

function getClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  return new Resend(apiKey);
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Confirmation email sent when a user creates or joins a trip, so they have a link back to it
 * even if they lose the invite or close the tab. Sent via Resend — see RESEND_API_KEY in
 * .env.local.example.
 */
export async function sendTripEmail(input: {
  to: string;
  tripName: string;
  tripUrl: string;
  kind: "created" | "joined";
}) {
  const client = getClient();

  const tripName = escapeHtml(input.tripName);
  const tripUrl = escapeHtml(input.tripUrl);
  const subject =
    input.kind === "created" ? `Your trip "${input.tripName}" is ready` : `You're on "${input.tripName}"`;
  const heading = input.kind === "created" ? "Your trip is ready" : "You're on the trip";
  const lede =
    input.kind === "created"
      ? "You created a new trip on Splitiful. Bookmark this link — it's how you and everyone you invite gets back in."
      : "You joined a trip on Splitiful. Bookmark this link — it's how you get back in to log expenses and see who owes what.";

  const { error } = await client.emails.send({
    from: FROM_ADDRESS,
    to: input.to,
    subject,
    text: [
      heading,
      "",
      lede,
      "",
      tripName,
      input.tripUrl,
    ].join("\n"),
    html: `
      <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #231c12;">
        <h1 style="font-size: 22px; margin: 0 0 12px;">${heading}</h1>
        <p style="font-size: 15px; color: #4a4033; line-height: 1.55; margin: 0 0 20px;">${lede}</p>

        <div style="background: #faf6ef; border-radius: 16px; padding: 18px 20px; margin-bottom: 20px;">
          <div style="font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #8a7e68; margin-bottom: 6px;">
            Trip
          </div>
          <div style="font-size: 19px; font-weight: 700;">${tripName}</div>
        </div>

        <a
          href="${input.tripUrl}"
          style="display: inline-block; background: #c26a3a; color: #fff; padding: 13px 26px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 15px;"
        >
          Open the trip
        </a>

        <p style="font-size: 12.5px; color: #8a7e68; line-height: 1.5; margin: 22px 0 0; word-break: break-all;">
          Or paste this link in your browser:<br />
          <a href="${input.tripUrl}" style="color: #c26a3a;">${tripUrl}</a>
        </p>
      </div>
    `,
  });

  if (error) throw new Error(error.message);
}
