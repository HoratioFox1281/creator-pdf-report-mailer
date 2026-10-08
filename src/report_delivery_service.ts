import { createServer } from "node:http";
import { ZodError } from "zod";
import {
  createInfraiEmailSender,
  deliverCreatorReport,
  InfraiError,
  reportRequestSchema,
} from "./report_delivery.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");

const sendEmail = createInfraiEmailSender(apiKey);
const port = Number(process.env.PORT ?? 3000);

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/reports/email") {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "route_not_found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = reportRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result = await deliverCreatorReport(input, sendEmail);
    response.writeHead(202, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    const status = error instanceof ZodError || error instanceof SyntaxError
      ? 400
      : error instanceof InfraiError && error.status >= 400 && error.status < 500
        ? error.status
        : 502;
    const message = error instanceof ZodError ? error.flatten() : { message: (error as Error).message };
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: message }));
  }
}).listen(port, () => console.log(`Creator report service listening on http://localhost:${port}`));
