import { Resend } from "resend";
import { config } from "../config.js";

/**
 * Sends the digest by email. Swap this for a Telegram bot message or a
 * Slack webhook post if you'd rather receive it there - both are simpler
 * than email and just as free; this is the default because it needs no
 * extra app/bot setup.
 */
export async function sendDigestEmail(markdown: string, reportDate: string) {
  if (!config.resend.apiKey) {
    console.warn("[email] RESEND_API_KEY not configured. Skipping email delivery.");
    return;
  }
  try {
    const resend = new Resend(config.resend.apiKey);
    const html = markdownToBasicHtml(markdown);
    const { error } = await resend.emails.send({
      from: config.resend.fromEmail,
      to: config.resend.toEmail,
      subject: `Career digest - ${reportDate}`,
      html,
    });
    if (error) {
      console.warn("[email] Resend email delivery warning:", JSON.stringify(error));
    } else {
      console.log("[email] Digest email sent successfully!");
    }
  } catch (err: any) {
    console.warn("[email] Email delivery error:", err.message);
  }
}

// Minimal, dependency-free markdown -> HTML for headings/bold/bullets/links.
// Good enough for a digest email; swap in a real markdown renderer if you
// want richer formatting.
function markdownToBasicHtml(markdown: string): string {
  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withInline = escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

  const lines = withInline.split("\n").map((line) => {
    if (line.startsWith("### ")) return `<h3>${line.slice(4)}</h3>`;
    if (line.startsWith("## ")) return `<h2>${line.slice(3)}</h2>`;
    if (line.startsWith("# ")) return `<h1>${line.slice(2)}</h1>`;
    if (line.startsWith("- ")) return `<li>${line.slice(2)}</li>`;
    return line ? `<p>${line}</p>` : "";
  });

  return lines.join("\n");
}
