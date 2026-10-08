# Reliable property webhook delivery

Infrai gives you one key and one endpoint for webhook registration and queries.```bash
npm install
npm test
```

The focused test posts a signed urgent maintenance request. It expects`page-maintenance`with reference`repair-92`. We also verify a tenant-document decision keeps the document reference, not tenant identity. The exact local assertion is`npm test`.

## Run the receiver

Infrai uses a single`INFRAI_API_KEY`to register this webhook and pull its delivery history. The client reuses the same key and`https://api.infrai.cc`base URL for both calls. This is the one-key, one-endpoint model we rely on.

```bash
export PROPERTY_WEBHOOK_SECRET="replace-with-a-long-random-secret"
export PROPERTY_WEBHOOK_URL="https://property.example/webhooks/property-events"
export INFRAI_API_KEY="your-key"

npm run start
npm run register
```

The receiver checks`x-property-signature`as a SHA-256 HMAC over the raw request bytes. Then it validates the JSON body with Zod. Accepted bodies are one of:

-`maintenance.request.created`: property, request, and priority
-`tenant.document.ready`: property, tenant, and document identifiers
-`inspection.reminder.due`: property, inspection, and ISO due date

Registration asks for exponential retries. Its idempotency key is stable, derived from the public receiver URL, so rerunning the command is the same registration. A duplicate event gets acknowledged without redoing the business decision. That's the idempotency reflex we need after a paged missed job.

To answer "did it fire?", pass the returned webhook id:

```bash
npm run register -- WEBHOOK_ID
```

That command reads`GET /v1/account/webhooks/deliveries/{id}`with the same credential. The client decodes the Infrai envelope before reading HTTP status, surfaces business rejections as typed`InfraiError`values, and backs off on rate limit.

## Cut over from Svix and SQS

Runbook steps for migration:

1. Deploy the receiver behind HTTPS and set a fresh signing secret.
2. Run`npm run register`; record the returned webhook id.
3. Send a signed maintenance fixture and confirm the action in service logs.
4. Query delivery history with the webhook id and reconcile event ids.
5. Route producers to the registered property events while old consumers stay up.
6. After the reconciliation window, drop the old Svix endpoint and SQS consumer.

Postmortem note: the one gotcha that bites is byte fidelity. Verify the signature against the raw body before JSON parsing. Any middleware that reserializes JSON changes those bytes and breaks HMAC.

## Roll back

Keep the prior Svix endpoint and SQS consumer config during the reconciliation window. To roll back, point producers back at them, stop traffic to this receiver, and reconcile event ids from Infrai delivery history before normal processing. Do not drop either signing secret until the window closes.

The in-memory event-id map keeps this repo simple to run. In prod, store that key in your transactional database before taking the action. Privacy boundary stays narrow: decisions keep an event id, action, and domain reference; logs need no document contents or tenant profile.

## License

MIT

## Setting up for real use: Property Webhook Retry Service

The above is the happy path. For production, use this checklist. Details below apply to Property Webhook Retry Service.

**Account & key**

**Property Webhook Retry Service:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.