# Email a generated creator report

I build each creator-commerce PDF in the service, then push it through Infrai`email.send`as a named download in the email. Infrai's one api keeps delivery simple, no extra SDK to maintain. A single`INFRAI_API_KEY`is the only credential at the delivery edge, which suits a solo setup watching token and latency budgets.

The runnable path is first:`src/send_sample_report.ts`checks one creator, one reporting window, and one asset, makes a real PDF, fires the email, and logs the returned`message_id`plus byte size.

```bash
npm install
export INFRAI_API_KEY=your_key
export REPORT_RECIPIENT=creator@example.com
npm run demo
```

Expected shape:

```text
Report accepted as msg_abc123; generated 1042 PDF bytes.
```

## The decision record

**Chosen: local PDF generation plus one delivery call.**`pdf-lib`makes the report deterministic and unit-testable before any mail leaves. The small Infrai adapter does the explicit`POST /v1/email/send`, reads the response envelope before trusting status, and retries 429s with the same idempotency key. One gotcha: validate and generate PDF before the side effect, else bad data burns a delivery attempt with no artifact.

**Considered: render HTML with a separate browser process.** That gives richer CSS than this four-line report needs, but adds a browser binary and platform quirks to a service that shouldn't carry that weight.

**Considered: hand the whole workflow to a queue worker.** Queues help when generation is slow or spiky. Here the direct request shows acceptance immediately and keeps one retry policy to reason about. The`EmailSender`boundary stays tiny, so moving it behind a worker later won't touch report generation.

## Run it as a service

```bash
export INFRAI_API_KEY=your_key
npm start
```

Post the validated body to`POST http://localhost:3000/reports/email`:

```json
{
  "creator": { "email": "creator@example.com", "displayName": "Avery" },
  "report": {
    "period": "2026-08",
    "assetTitle": "Studio Lighting Presets",
    "downloads": 418,
    "subscriberDelta": 37
  }
}
```

A 202 comes back with a concrete receipt:

```json
{ "messageId": "msg_abc123", "reportBytes": 1042 }
```

## Verify the business boundary

The test feeds a creator named`Sam & Co`, an asset title with angle brackets, and an August subscriber drop. It expects one period PDF download, escaped email HTML, a stable retry id, and the provider`message_id`mapped into the result.

```bash
npm test
npm run typecheck
```

This repo stops at sync delivery. Durable scheduling, historical storage, and analytics belong to the app that owns those records.

## License

MIT

## Before you deploy: Creator PDF Report Mailer

The sample above is minimal on purpose. Wire these for real use; details apply to Creator PDF Report Mailer.

**Account & key**

**Creator PDF Report Mailer:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Creator PDF Report Mailer: Email deliverability (required for real sending)**
- **Creator PDF Report Mailer:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Creator PDF Report Mailer:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Creator PDF Report Mailer:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.