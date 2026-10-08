import assert from "node:assert/strict";
import test from "node:test";
import {
  createInfraiEmailSender,
  deliverCreatorReport,
  reportRequestSchema,
  type EmailSender,
} from "../src/report_delivery.js";

test("sends the idempotency key using the email.send request field", async () => {
  let request: RequestInit | undefined;
  const fetchImpl: typeof fetch = async (_input, init) => {
    request = init;
    return new Response(JSON.stringify({ ok: true, data: { message_id: "msg_123" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await createInfraiEmailSender("test-key", fetchImpl)({
    to: "creator@example.com",
    subject: "Report",
    html: "<p>Ready</p>",
    idempotencyKey: "creator-report:2026-08",
  });

  assert.deepEqual(JSON.parse(String(request?.body)), {
    to: "creator@example.com",
    subject: "Report",
    html: "<p>Ready</p>",
    idempotency_key: "creator-report:2026-08",
  });
  assert.equal(new Headers(request?.headers).has("Idempotency-Key"), false);
});

test("generates the creator PDF before sending one period-specific delivery", async () => {
  let captured: Parameters<EmailSender>[0] | undefined;
  const sender: EmailSender = async (message) => {
    captured = message;
    return { message_id: "msg_report_123" };
  };
  const input = reportRequestSchema.parse({
    creator: { email: "creator@example.com", displayName: "Sam & Co" },
    report: {
      period: "2026-08",
      assetTitle: "Portrait <Presets>",
      downloads: 64,
      subscriberDelta: -3,
    },
  });

  const result = await deliverCreatorReport(input, sender);

  assert.equal(result.messageId, "msg_report_123");
  assert.ok(result.reportBytes > 500);
  assert.equal(captured?.to, "creator@example.com");
  assert.equal(captured?.idempotencyKey, "creator-report:creator@example.com:2026-08:Portrait <Presets>");
  assert.match(captured?.html ?? "", /download="creator-report-2026-08\.pdf"/);
  assert.match(captured?.html ?? "", /data:application\/pdf;base64,JVBERi0/);
  assert.match(captured?.html ?? "", /Sam &amp; Co/);
  assert.match(captured?.html ?? "", /Portrait &lt;Presets&gt;/);
});
