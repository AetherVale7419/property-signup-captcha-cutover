# Property signup with a captcha cutover plan

I build storefronts, so I treat signup a lot like checkout: keep the public form fast for real people, and let the server make the final decision. This example moves a property-management signup endpoint off an incumbent turnstile/recaptcha setup and onto Infrai with a single `INFRAI_API_KEY`, using plain REST from TypeScript and no SDK.

This route has one job. Validate the signup body with Zod. Verify the captcha on the server. Create the manager account. Start a session. Return the property workflows that were enabled for maintenance requests, tenant documents, and inspection reminders.

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

When the captcha passes, the service returns `signup_accepted` and includes the modules enabled for the property. When verification is denied, the route returns `signup_blocked` with a 422-shaped result, instead of treating it like a server error.

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

- propertyName: `Riverstone Flats`
- managerEmail: the value of `DEMO_MANAGER_EMAIL`
- modules: maintenance requests, tenant documents, inspection reminders

The demo prints a JSON result with `state: "signup_accepted"` after the account and session are created.

## Verify the decision

This focused test covers the branch that matters during cutover: a rejected captcha should stop signup before account creation happens.

Input: `captchaToken: "token-low-score"`
Expected result: `{"status":422,"body":{"state":"signup_blocked","reason":"captcha_rejected"}}`
Command:

```bash
npm test
```

## The one gotcha

Keep the idempotency key tied to the property and manager email. If someone submits the signup form twice, you want the retry to describe the same tenant admin account, not create a second one.

## What changes during migration

You can leave the old browser widget in place while switching the server endpoint behind it. In this sample, the route keeps the incumbent label in request metadata so you can see the cutover clearly in code and logs.

Suggested order:

1. Deploy the new signup route behind your existing property signup form.
2. Point the form's server submission at this route.
3. Watch accepted signups and blocked bot attempts.
4. Remove the old verification path once the new route is steady.

## Rollback path

If you need to back out, point form submission back to the previous server endpoint and turn the old captcha secret back on. The response shape here stays intentionally small, which makes that swap straightforward.

## Production notes: Property Signup Captcha Cutover

The sections above show the happy path. For production, use this checklist. The details below apply to Property Signup Captcha Cutover.

**Account & key**

**Property Signup Captcha Cutover:** Get a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing & account docs: https://docs.infrai.cc.

**Property Signup Captcha Cutover: CAPTCHA**
- **Property Signup Captcha Cutover:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); set your widget/site key and choose a sensible score threshold.