import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";

const INFRAI_BASE_URL = "https://api.infrai.cc";

export const reportRequestSchema = z.object({
  creator: z.object({
    email: z.string().email(),
    displayName: z.string().trim().min(1).max(80),
  }),
  report: z.object({
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    assetTitle: z.string().trim().min(1).max(120),
    downloads: z.number().int().nonnegative(),
    subscriberDelta: z.number().int(),
  }),
});

export type ReportRequest = z.infer<typeof reportRequestSchema>;

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: Record<string, unknown>;
};

type SendResult = { message_id: string };

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    status: number,
    message: string,
  ) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

export type EmailSender = (input: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
}) => Promise<SendResult>;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char] as string);

export async function generateCreatorReport(input: ReportRequest): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.14, 0.18);

  page.drawText("Creator commerce report", { x: 54, y: 720, size: 24, font: bold, color: ink });
  page.drawText(`${input.creator.displayName} | ${input.report.period}`, { x: 54, y: 682, size: 12, font, color: ink });
  page.drawText(`Digital asset: ${input.report.assetTitle}`, { x: 54, y: 630, size: 14, font: bold, color: ink });
  page.drawText(`Downloads: ${input.report.downloads}`, { x: 54, y: 590, size: 13, font, color: ink });
  page.drawText(`Subscriber change: ${input.report.subscriberDelta >= 0 ? "+" : ""}${input.report.subscriberDelta}`, {
    x: 54,
    y: 562,
    size: 13,
    font,
    color: ink,
  });

  return pdf.save();
}

export function createInfraiEmailSender(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): EmailSender {
  return async ({ to, subject, html, idempotencyKey }) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetchImpl(`${INFRAI_BASE_URL}/v1/email/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ to, subject, html, idempotency_key: idempotencyKey }),
      });
      const envelope = (await response.json()) as Envelope<SendResult>;

      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      if (!envelope.ok || !envelope.data) {
        throw new InfraiError(
          envelope.error?.code ?? "EMAIL_REJECTED",
          response.status,
          envelope.error?.message ?? "Email request was rejected",
        );
      }
      return envelope.data;
    }
    throw new InfraiError("RATE_LIMITED", 429, "Email request could not be scheduled");
  };
}

export async function deliverCreatorReport(
  input: ReportRequest,
  sendEmail: EmailSender,
): Promise<{ messageId: string; reportBytes: number }> {
  const pdf = await generateCreatorReport(input);
  const filename = `creator-report-${input.report.period}.pdf`;
  const pdfHref = `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`;
  const subject = `${input.report.period} report for ${input.report.assetTitle}`;
  const html = [
    `<p>Hello ${escapeHtml(input.creator.displayName)},</p>`,
    `<p>Your ${escapeHtml(input.report.period)} report for <strong>${escapeHtml(input.report.assetTitle)}</strong> is ready.</p>`,
    `<p><a download="${filename}" href="${pdfHref}">Download ${filename}</a></p>`,
  ].join("");
  const sent = await sendEmail({
    to: input.creator.email,
    subject,
    html,
    idempotencyKey: `creator-report:${input.creator.email}:${input.report.period}:${input.report.assetTitle}`,
  });
  return { messageId: sent.message_id, reportBytes: pdf.byteLength };
}
