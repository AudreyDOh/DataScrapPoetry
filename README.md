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
- Environment: `WORKSHOP_API_ORIGIN=https://data-scrap-poetry.super-giant-1444.chatgpt.site`

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

Ten people (including the creator) can join. Extracted text allows 100,000 characters per import. Only the creator sees Visualization and its downloads. **Download & new room** freezes edits, downloads a visualization archive, and after save confirmation deletes that room’s working data and captures before creating an empty room. Other rooms stay intact. Use **Open archive** to reopen downloaded JSON locally; it contains source layouts and poem paths, not participant credentials. External image/font URLs remain external.
