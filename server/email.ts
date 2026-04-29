import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM ?? SMTP_USER ?? "noreply@partsmanager.app";

function isSmtpConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function escHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createTransport() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

function emailLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f1923;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f1923;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#141f2e;border-radius:8px;overflow:hidden;border:1px solid #1e2d40;">
          <!-- Header -->
          <tr>
            <td style="background-color:#141f2e;padding:24px 32px;border-bottom:3px solid #f59e0b;">
              <span style="font-size:20px;font-weight:700;color:#f59e0b;letter-spacing:0.5px;">PartsManager</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #1e2d40;">
              <p style="margin:0;font-size:12px;color:#6b7f96;text-align:center;">
                This is an automated notification from PartsManager. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function badge(text: string, color: string, bg: string): string {
  return `<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600;color:${color};background-color:${bg};">${text}</span>`;
}

function infoRow(label: string, value: string): string {
  return `
  <tr>
    <td style="padding:8px 0;color:#8fa3bc;font-size:14px;width:140px;vertical-align:top;">${label}</td>
    <td style="padding:8px 0;color:#e8edf5;font-size:14px;vertical-align:top;">${value}</td>
  </tr>`;
}

export interface CountSubmittedPayload {
  sessionId: string;
  submitterName: string;
  totalItems: number;
  itemsEntered: number;
  adminEmails: string[];
}

export interface CountReviewedPayload {
  sessionId: string;
  status: "approved" | "rejected";
  reviewerName: string;
  adminNotes?: string | null;
  submitterEmail: string;
  submitterName: string;
}

export async function sendCountSubmittedNotification(payload: CountSubmittedPayload): Promise<void> {
  if (!isSmtpConfigured()) {
    console.log(
      `[email] SMTP not configured — skipping notification: count session ${payload.sessionId} submitted by ${payload.submitterName} (would notify: ${payload.adminEmails.join(", ")})`
    );
    return;
  }

  const validAdmins = payload.adminEmails.filter(Boolean);
  if (validAdmins.length === 0) {
    console.log(`[email] No admin emails found for count session ${payload.sessionId}, skipping.`);
    return;
  }

  const body = `
    <h2 style="margin:0 0 8px;font-size:22px;color:#e8edf5;">Inventory Count Submitted</h2>
    <p style="margin:0 0 24px;color:#8fa3bc;font-size:15px;">A count is ready for your review.</p>
    <div style="margin-bottom:24px;">
      ${badge("Awaiting Review", "#f59e0b", "rgba(245,158,11,0.15)")}
    </div>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #1e2d40;">
      ${infoRow("Session ID", `#${payload.sessionId.slice(0, 8).toUpperCase()}`)}
      ${infoRow("Submitted by", escHtml(payload.submitterName))}
      ${infoRow("Parts counted", `${payload.itemsEntered} of ${payload.totalItems}`)}
    </table>
    <p style="margin:28px 0 0;color:#8fa3bc;font-size:14px;">
      Log in to PartsManager to review and approve or reject this count.
    </p>
  `;

  const transport = createTransport();
  await transport.sendMail({
    from: SMTP_FROM,
    to: validAdmins,
    subject: `Inventory Count Ready for Review — ${payload.submitterName}`,
    html: emailLayout("Inventory Count Submitted", body),
  });

  console.log(`[email] Sent count-submitted notification to ${validAdmins.length} admin(s) for session ${payload.sessionId}`);
}

export async function sendCountReviewedNotification(payload: CountReviewedPayload): Promise<void> {
  if (!isSmtpConfigured()) {
    console.log(
      `[email] SMTP not configured — skipping notification: count session ${payload.sessionId} ${payload.status} (would notify: ${payload.submitterEmail})`
    );
    return;
  }

  if (!payload.submitterEmail) {
    console.log(`[email] Submitter has no email for count session ${payload.sessionId}, skipping.`);
    return;
  }

  const isApproved = payload.status === "approved";
  const statusBadge = isApproved
    ? badge("Approved", "#22c55e", "rgba(34,197,94,0.15)")
    : badge("Rejected", "#ef4444", "rgba(239,68,68,0.15)");

  const notesHtml = payload.adminNotes
    ? `<div style="margin-top:20px;padding:16px;background-color:#0f1923;border-left:3px solid #f59e0b;border-radius:4px;">
        <p style="margin:0 0 6px;font-size:12px;color:#8fa3bc;text-transform:uppercase;letter-spacing:0.5px;">Admin Notes</p>
        <p style="margin:0;font-size:14px;color:#e8edf5;">${escHtml(payload.adminNotes)}</p>
       </div>`
    : "";

  const actionText = isApproved
    ? "The inventory has been updated to match your counted quantities."
    : "Please review the count and resubmit when corrections have been made.";

  const body = `
    <h2 style="margin:0 0 8px;font-size:22px;color:#e8edf5;">Inventory Count ${isApproved ? "Approved" : "Rejected"}</h2>
    <p style="margin:0 0 24px;color:#8fa3bc;font-size:15px;">Your submitted inventory count has been reviewed.</p>
    <div style="margin-bottom:24px;">
      ${statusBadge}
    </div>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #1e2d40;">
      ${infoRow("Session ID", `#${payload.sessionId.slice(0, 8).toUpperCase()}`)}
      ${infoRow("Reviewed by", escHtml(payload.reviewerName))}
    </table>
    ${notesHtml}
    <p style="margin:24px 0 0;color:#8fa3bc;font-size:14px;">${actionText}</p>
  `;

  const transport = createTransport();
  await transport.sendMail({
    from: SMTP_FROM,
    to: payload.submitterEmail,
    subject: `Your Inventory Count Has Been ${isApproved ? "Approved" : "Rejected"}`,
    html: emailLayout(`Inventory Count ${isApproved ? "Approved" : "Rejected"}`, body),
  });

  console.log(`[email] Sent count-${payload.status} notification to ${payload.submitterEmail} for session ${payload.sessionId}`);
}
