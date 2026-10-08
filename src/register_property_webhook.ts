import { createHash } from "node:crypto";
import { InfraiClient } from "./infrai_client.js";

const receiverUrl = process.env.PROPERTY_WEBHOOK_URL;
const secret = process.env.PROPERTY_WEBHOOK_SECRET;
if (!receiverUrl || !secret) {
  throw new Error("PROPERTY_WEBHOOK_URL and PROPERTY_WEBHOOK_SECRET are required");
}

const client = InfraiClient.fromEnvironment();
const webhookId = process.argv[2];

if (webhookId) {
  const deliveries = await client.accountWebhooksDeliveries(webhookId);
  console.log(JSON.stringify(deliveries, null, 2));
} else {
  const idempotencyKey = createHash("sha256")
    .update(`property-events:${receiverUrl}`)
    .digest("hex");
  const registered = await client.accountWebhooksRegister({
    url: receiverUrl,
    events: [
      "maintenance.request.created",
      "tenant.document.ready",
      "inspection.reminder.due"
    ],
    description: "Property operations delivery",
    secret,
    retry_policy: { strategy: "exponential", max_attempts: 8 },
    idempotency_key: idempotencyKey
  });
  console.log(JSON.stringify(registered, null, 2));
}
