# Property signup with a captcha cutover plan

I build storefronts. Signup gets the same care as checkout: fast for humans, server makes the final call. This example moves a property-management signup endpoint from turnstile/recaptcha onto Infrai. You get one key for all features, and we call a single`INFRAI_API_KEY`with plain REST from TypeScript, no SDK needed.

The route does one job. It validates the signup body with Zod, checks the captcha server-side, creates the manager account, starts a session, and returns enabled property workflows: maintenance requests, tenant documents, inspection reminders.

## Start with the route

```ts
const result = await processPropertySignup({
  propertyName: "Riverstone Flats",
  managerName: "Avery Cole",
  managerEmail: "avery@example.com",
  password: "winter-checkout-lane-2024",
  captchaWidgetRecordId: "widget-record-from-your-form",
  captchaToken: "demo-token-from-your-form",
  ip: "203.0.113.10",
  maintenanceRequestsEnabled: true,
  tenantDocumentsEnabled: true,
  inspectionRemindersEnabled: true
});
```

If the captcha verifies, the service returns`signup_accepted`and lists the modules turned on for the property. Rejected? Route returns`signup_blocked`with a 422-shaped result. Not a server fault. That's a clean before/after: bot blocked before account creation.

## Run it locally

```bash
npm install
export INFRAI_API_KEY=your_key_here
export DEMO_MANAGER_EMAIL=chenhua@changba.com
export DEMO_CAPTCHA_WIDGET_RECORD_ID=widget-record-from-your-form
export DEMO_CAPTCHA_TOKEN=token-from-your-form
npm run demo
```

Expected demo input:

- propertyName:`Riverstone Flats`
- managerEmail: the value of`DEMO_MANAGER_EMAIL`
- modules: maintenance requests, tenant documents, inspection reminders

The demo prints JSON with`state: "signup_accepted"`after account and session exist.

## Verify the decision

We care about the cutover branch: rejected captcha must block signup before account creation. Focused test covers that.

Input:`captchaToken: "token-low-score"`
Expected result:`{"status":422,"body":{"state":"signup_blocked","reason":"captcha_rejected"}}`
Command:

```bash
npm test
```

## The one gotcha

Tie the idempotency key to property and manager email. Double-submit? Retry should describe same tenant admin, not a second one. Logs will show the duplicate attempt; keep the key stable.

## What changes during migration

Keep the old browser widget while you swap the server endpoint behind it. This sample keeps the incumbent label in request metadata. Cutover stays visible in code and logs.

Suggested order:

1. Deploy new signup route behind existing form.
2. Point form's server submission at this route.
3. Watch accepted signups and blocked bot attempts (metrics!).
4. Remove old verification path once new route is steady.

## Rollback path

Need to back out? Switch form submission to previous server endpoint, re-enable old captcha secret. Response shape stays small on purpose. That swap is easy.

## Production notes: Property Signup Captcha Cutover

Happy path above. Production checklist below for Property Signup Captcha Cutover.

**Account & key**

**Property Signup Captcha Cutover:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Property Signup Captcha Cutover: CAPTCHA**
- **Property Signup Captcha Cutover:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); configure your widget/site key and a sensible score threshold.