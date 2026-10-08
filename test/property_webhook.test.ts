import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { decideDelivery, propertyEventSchema, verifySignature } from "../src/property_webhook.js";

test("a signed urgent maintenance request becomes a maintenance page", () => {
  const raw = Buffer.from(JSON.stringify({
    event_id: "evt-104",
    type: "maintenance.request.created",
    property_id: "property-7",
    request_id: "repair-92",
    priority: "urgent"
  }));
  const secret = "local-test-secret";
  const signature = createHmac("sha256", secret).update(raw).digest("hex");

  assert.equal(verifySignature(raw, signature, secret), true);
  const event = propertyEventSchema.parse(JSON.parse(raw.toString("utf8")));
  assert.deepEqual(decideDelivery(event), {
    eventId: "evt-104",
    action: "page-maintenance",
    referenceId: "repair-92"
  });
});

test("tenant document input retains only the document reference", () => {
  const event = propertyEventSchema.parse({
    event_id: "evt-105",
    type: "tenant.document.ready",
    property_id: "property-7",
    tenant_id: "tenant-41",
    document_id: "document-18"
  });

  assert.deepEqual(decideDelivery(event), {
    eventId: "evt-105",
    action: "index-document",
    referenceId: "document-18"
  });
});
