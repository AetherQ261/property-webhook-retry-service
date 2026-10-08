import { createServer } from "node:http";
import { ZodError } from "zod";
import { decideDelivery, propertyEventSchema, verifySignature } from "./property_webhook.js";

const secret = process.env.PROPERTY_WEBHOOK_SECRET;
if (!secret) throw new Error("PROPERTY_WEBHOOK_SECRET is required");

const processed = new Map<string, ReturnType<typeof decideDelivery>>();

const server = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/webhooks/property-events") {
    response.writeHead(404).end();
    return;
  }

  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    const rawBody = Buffer.concat(chunks);
    const signature = request.headers["x-property-signature"];
    if (typeof signature !== "string" || !verifySignature(rawBody, signature, secret)) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ accepted: false }));
      return;
    }

    try {
      const event = propertyEventSchema.parse(JSON.parse(rawBody.toString("utf8")));
      const existing = processed.get(event.event_id);
      const decision = existing ?? decideDelivery(event);
      processed.set(event.event_id, decision);
      response.writeHead(existing ? 200 : 202, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ accepted: true, duplicate: existing !== undefined, decision }));
    } catch (error) {
      const status = error instanceof ZodError || error instanceof SyntaxError ? 400 : 500;
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ accepted: false }));
    }
  });
});

const port = Number(process.env.PORT ?? "3000");
server.listen(port, () => console.log(`Property webhook receiver listening on ${port}`));
