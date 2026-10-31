# Mapbox setup for Hisaab

The public map token is configured locally and the Mapbox integration is active in the private preview. Satellite, lighting and terrain were verified. Billing and account permissions were not changed. The steps below remain the account and future production-token reference.

1. Create your account at https://account.mapbox.com/auth/signup/ and verify the email. For an initial prototype choose Start without a credit card.
2. The card-free trial currently includes 5,000 web map loads per month, not 50,000. It provides one trial token and does not permit creating, rotating or deleting tokens. The Raster Tiles API is unavailable during this trial, so satellite access must be verified rather than promised.
3. Copy the supplied map token into `.env.mapbox.local` after `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=`. This ignored file has owner-only permissions. Do not use a secret `sk.` token, password, or account-management token. Tell Codex when saved; do not post credentials in chat.
4. If you choose to add billing, complete the payment setup yourself. The standard plan includes 50,000 web map loads per month at no charge and bills overages. Set usage alerts; alerts are not a hard spending cap.
5. On a billing-enabled account, create a separate public token named Hisaab development with only the public map read scopes required by the SDK (styles:read and fonts:read). Restrict its allowed URL to http://localhost:3000. IP-address URL restrictions are unsupported, so the current http://127.0.0.1:3000 preview will be opened as localhost for this integration. Use a separate production token restricted to the eventual deployed hostname.
6. Codex then integrates Mapbox GL JS, Standard day/dusk/night presets, terrain and the existing individual asset vector tiles and receipt interactions. Satellite is enabled only after account access is verified. No need to upload the private financial review data to Mapbox. The outline mask and camera bounds carry over.
7. Verify actual Indian urban and rural coverage, retained point identities and totals, individual selection, mobile performance, style switching and attribution. Production geography hosting, reviewed payment evidence and release gates remain separate unfinished work.

Checked 6 October 2026. Official references:

- https://docs.mapbox.com/accounts/guides/signup/
- https://docs.mapbox.com/accounts/guides/tokens/
- https://www.mapbox.com/pricing
- https://docs.mapbox.com/map-styles/guides/standard-styles/
