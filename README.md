# Data-Scrap-Poetry on Render

This release serves the workshop and host visualization from a separate Render web
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

`render.yaml` provides the same settings for a Blueprint deployment. Render
supplies `PORT` and `RENDER_EXTERNAL_URL`. No database password or admin token is
needed by this gateway. Normal participant bearer tokens are forwarded only to
the fixed workshop API. Browser cookies are never forwarded.

## Addresses

- Workshop: `/workshop`
- Host visualization: `/space?room=<room-code>`
- Saved visualization file: `/space?archive`

Use the new site's **Copy link** button to share links under the new hostname.
Participant sessions are browser-origin-specific: a session on the old address
does not automatically sign in on the new one. Existing gallery IDs require the room creator’s session on the address being used. The original workshop remains available for existing editing
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

Ten people (including the creator) can join; extracted text allows 100,000 characters per import. The participant screen contains only writing/sharing controls. `/facilitator` is a separate private-access management page for retained room records, visualization downloads and revision-checked deletion. The backend checks its key against the secret `FACILITATOR_KEY_HASH`; no management credential is stored in this gateway. Three.js is loaded only on the separate visualization page. Downloaded archives reopen locally at `/space?archive` after server deletion; external image/font URLs remain external. Use **Save access link** in the manager to retain private access across tabs/devices.
