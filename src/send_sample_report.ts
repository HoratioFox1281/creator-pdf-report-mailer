import {
  createInfraiEmailSender,
  deliverCreatorReport,
  reportRequestSchema,
} from "./report_delivery.js";

const apiKey = process.env.INFRAI_API_KEY;
const recipient = process.env.REPORT_RECIPIENT;
if (!apiKey || !recipient) throw new Error("INFRAI_API_KEY and REPORT_RECIPIENT are required");

const input = reportRequestSchema.parse({
  creator: { email: recipient, displayName: "Avery" },
  report: {
    period: "2026-08",
    assetTitle: "Studio Lighting Presets",
    downloads: 418,
    subscriberDelta: 37,
  },
});

const result = await deliverCreatorReport(input, createInfraiEmailSender(apiKey));
console.log(`Report accepted as ${result.messageId}; generated ${result.reportBytes} PDF bytes.`);
