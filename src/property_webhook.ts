import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const propertyEventSchema = z.discriminatedUnion("type", [
  z.object({
    event_id: z.string().min(1),
    type: z.literal("maintenance.request.created"),
    property_id: z.string().min(1),
    request_id: z.string().min(1),
    priority: z.enum(["routine", "urgent"])
  }).strict(),
  z.object({
    event_id: z.string().min(1),
    type: z.literal("tenant.document.ready"),
    property_id: z.string().min(1),
    tenant_id: z.string().min(1),
    document_id: z.string().min(1)
  }).strict(),
  z.object({
    event_id: z.string().min(1),
    type: z.literal("inspection.reminder.due"),
    property_id: z.string().min(1),
    inspection_id: z.string().min(1),
    due_on: z.string().date()
  }).strict()
]);

export type PropertyEvent = z.infer<typeof propertyEventSchema>;

export type DeliveryDecision = {
  eventId: string;
  action: "page-maintenance" | "index-document" | "notify-inspector";
  referenceId: string;
};

export function verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const supplied = Buffer.from(signature, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return supplied.length === expectedBytes.length && timingSafeEqual(supplied, expectedBytes);
}

export function decideDelivery(event: PropertyEvent): DeliveryDecision {
  switch (event.type) {
    case "maintenance.request.created":
      return {
        eventId: event.event_id,
        action: "page-maintenance",
        referenceId: event.request_id
      };
    case "tenant.document.ready":
      return {
        eventId: event.event_id,
        action: "index-document",
        referenceId: event.document_id
      };
    case "inspection.reminder.due":
      return {
        eventId: event.event_id,
        action: "notify-inspector",
        referenceId: event.inspection_id
      };
  }
}
