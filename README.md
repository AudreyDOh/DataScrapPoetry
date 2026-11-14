# Data-Scrap-Poetry on Render

This release serves the workshop, public visualization, and private facilitator portal from a separate Render web
service. It keeps the existing workshop API and D1 database as its backend, so
saved rooms remain in the same database. This is a new
public address, not a database migration or a fully independent backend.

## Deploy

Create a separate repository from this directory, then a new Render **Web Service**.
Do not replace or suspend DayTrader.

- Name: `datascrappoetry` (the exact onrender.com hostname depends on availability)
- Runtime: Node
- Compute plan: Free
- Build command: `npm test`
- Start command: `npm start`
- Health check: `/healthz`
- Environment: `WORKSHOP_API_ORIGIN=https://data-scrap-poetry.amazingsriracha.chatgpt.site`
- Secret environment variable: `FACILITATOR_API_KEY` — the existing 64-character facilitator Access key, entered in Render's Environment settings. Never commit its value.

`render.yaml` provides the same settings for a Blueprint deployment. Render
supplies `PORT` and `RENDER_EXTERNAL_URL`. The server uses the facilitator secret for
explicitly allowlisted public reads and authenticated management requests. It is
never included in static assets or public responses. Normal participant bearer
tokens are forwarded only to the fixed workshop API. Browser cookies are never forwarded.

## Addresses

- Workshop: `/workshop`
- Public visualization: `/space?room=<room-code>` (or enter a room code at `/space`)
- Private facilitator portal: `/facilitator` (optional `?room=<room-code>`)
- Saved visualization file: `/space?archive`

Use the new site's **Copy link** button to share links under the new hostname.
Participant sessions are browser-origin-specific: a session on the old address
does not automatically sign in on the new one. Old `?managed=` visualization links redirect to the public room view; old `?gallery=` links ask for the room code. The original workshop remains available for existing editing
sessions; use new rooms on Render unless session migration is arranged.

## Local check

Run `npm test`, then `npm start`. The default port is 10000. All static assets
are included locally; no install or frontend build is needed.

Free Render services sleep after 15 idle minutes and share the workspace's
monthly free instance hours. Since application data lives in the existing
database, restarting this Render service does not erase poems or shared words.

The screenshot exporter uses html-to-image 1.11.13 (MIT); its license is included
in `public/vendor/html-to-image.LICENSE`.

## Ten-person workshops

Ten people (including the creator) can join; extracted text allows 100,000 characters per import. The participant screen contains only writing/sharing controls. `/facilitator` is a separate password-protected management page for retained room records, visualization downloads and revision-checked deletion. The backend checks its key against the secret `FACILITATOR_KEY_HASH`. Three.js is loaded only on the separate visualization page. Downloaded archives reopen locally at `/space?archive` after server deletion; external image/font URLs remain external.

## Access and storage

- The facilitator signs in with the existing Access key as the password. The server sets a signed HttpOnly, SameSite=Strict session cookie for 12 hours (Secure on HTTPS). Another browser needs the same password. **Copy link** copies a plain URL without a credential.
- Successful migration of an old `#key=` link or localStorage key removes the stored browser key. **Sign out** clears the cookie. Existing Bearer-key clients remain supported. Rotating the server key invalidates all sessions; signing out only clears this browser's cookie.
- Management POSTs require the site's Origin; public endpoints accept only GET and cannot proxy management, exports, or room listing. Login allows ten failed attempts per minute per connection address. Behind Render's proxy, several visitors may share a limit; wait one minute if it triggers.
- Public room links reveal saved participant names, poems, source text, URLs, page layouts and word paths. No participant session tokens, unused word palettes or facilitator key are exposed. Treat room codes as public identifiers, not passwords. All retained rooms can be viewed by code, including rooms closed to further participation.
- The viewer checks for changes every 20 seconds and offers **Updates available · Refresh**; it preserves the visitor's arrangement until they refresh. Concurrent editing/deletion can invalidate a page being loaded; refresh the room view. An already open page or downloaded archive cannot be remotely erased.
- Public reads use at most 24 MiB of process-local cache, with short expirations and invalidation after a successful management edit. No second database or durable copy is created. The existing Sites backend remains a dependency; Render hosting alone does not replace it.
- This release does not change room expiration or reopen expired rooms. That requires a data-preserving update to the original backend. Never use the participant **Restart** action to reopen retained work: it replaces the room.

## Release verification

`npm test` verifies password/cookie handling, unauthorized reads and writes, CSRF,
public field projection, source membership, cache invalidation, and existing proxy behavior.
For a production rollout, set the secret before deploying the new code, compare
room revisions and data hashes before/after, and check a public room from a signed-out
browser. Do not create/delete production rooms as a smoke test.
