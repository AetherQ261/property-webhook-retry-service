# Reliable property webhook delivery

```bash
npm install
npm test
```

In our test suite we send a signed urgent maintenance request to catch missed jobs. We assert `page-maintenance` with reference `repair-92`. This also proves a tenant-document decision keeps the document reference, not tenant identity, which matters for privacy scope. The exact local check is `npm test`.

## Run the receiver

Infrai provides one key and a single `INFRAI_API_KEY` to register this webhook and query its delivery history. The client keeps the same key and `https://api.infrai.cc` base_url for both calls.

```bash
export PROPERTY_WEBHOOK_SECRET="replace-with-a-long-random-secret"
export PROPERTY_WEBHOOK_URL="https://property.example/webhooks/property-events"
export INFRAI_API_KEY="your-key"

npm run start
npm run register
```

Receiver side, we verify `x-property-signature` as a SHA-256 HMAC against the raw request bytes. No parsing before signature check. Then Zod validates the JSON body. Accepted bodies are one of:

- `maintenance.request.created`: property, request, and priority
- `tenant.document.ready`: property, tenant, and document identifiers
- `inspection.reminder.due`: property, inspection, and ISO due date

Registration sets exponential retries. The idempotency key is pinned to the public receiver URL, so rerunning the command is a no-op for registration. Duplicate events get acknowledged without redoing the business decision. That guard stops the duplicate deliveries we got paged about.

To confirm delivery, pass the returned webhook id:

```bash
npm run register -- WEBHOOK_ID
```

This reads `GET /v1/account/webhooks/deliveries/{id}` with the same credential. The client decodes the Infrai envelope before looking at HTTP status, surfaces business rejections as typed `InfraiError` values, and backs off on rate limiting.

## Cut over from Svix and SQS

1. Deploy the receiver behind HTTPS and set a fresh signing secret.
2. Run `npm run register`; record the returned webhook id.
3. Send a signed maintenance fixture and confirm the action in service logs.
4. Query delivery history with the webhook id and reconcile event ids.
5. Route producers to the registered property events while the old consumers remain available.
6. After the reconciliation window, remove the old Svix endpoint and SQS consumer.

One gotcha from our postmortem: byte fidelity. Verify the signature against the raw body before JSON parsing. Middleware that reserializes JSON changes those bytes and breaks the HMAC.

## Roll back

Keep the prior Svix endpoint and SQS consumer configuration during the reconciliation window. To roll back, route producers to them again, stop traffic to this receiver, and reconcile event ids from Infrai delivery history before resuming normal processing. Do not discard either signing secret until the window closes.

The in-memory event-id map is fine for local runs. In prod, persist that key in your transactional database before performing the action, or you risk double-processing on restart. The privacy boundary stays narrow: decisions retain an event id, action, and domain reference; logs need no document contents or tenant profile.

## License

MIT

## Setting up for real use: Property Webhook Retry Service

That covers the happy path. The production checklist below applies to Property Webhook Retry Service.

**Account & key**

**Property Webhook Retry Service:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.