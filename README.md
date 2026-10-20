# CivicFix 0.4.1

Home has a centered title, Report an Issue button and Issues below. Photos reveal preview/crop/GPS only after selection. Description alone is optional. Issues opens My reported issues. Total/Open/Closed boxes filter the list; Show all issues resets the status selection within the current scope. Rows are grouped as Open, Overdue and Closed and have Category, Country and City columns with live partial-text filters. Search has Distance (3 km default) and Location radio buttons. Location searches all loaded issues without requiring GPS; My reported issues always restricts ownership.

**Deployment required:** see [release and moderation setup](docs/RELEASE-SETUP.md). Download CivicFix-0.4.1-test-apk from the latest successful Actions run for immediate testing. Its temporary debug key may require reinstalling. Permanently signed release APKs also publish once signing secrets are configured. Live image submissions require server-side safety screening; demo previews are explicitly unscanned. Video is a proposed next step, not enabled.

## Backend and email OTP setup

Python 3.11+:

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
# Set environment variables shown in .env.example through your host's secret settings.
# The server reads process environment variables; it does not automatically load .env files.
gunicorn --bind 0.0.0.0:8080 --workers 2 --threads 4 --timeout 150 server:application
```

Required for email delivery:

| Variable | Value |
| --- | --- |
| SMTP_HOST | Your mail provider's SMTP hostname |
| SMTP_PORT | 587 for STARTTLS or 465 for implicit TLS |
| SMTP_USER | SMTP account username, if required |
| SMTP_PASSWORD | SMTP credential/app password, stored as a host secret |
| SMTP_FROM | A sender address authorized by that provider |
| CIVICFIX_DB | Writable persistent database path, e.g. /data/civicfix.sqlite3 |

Never add SMTP secrets to the app, ZIP, or GitHub. The app cannot send OTPs until this service is deployed and mail is configured. Misconfigured mail returns a visible error; there is no fake OTP success or production bypass.

Codes are six digits, expire in ten minutes, permit at most five guesses, and are stored as salted scrypt hashes. Resending invalidates the previous challenge; requests are rate limited per IP and email, with a one-minute resend cooldown. Successful verification yields a single-use token bound to that email and valid for ten minutes. Passwords use salted scrypt; sessions are stored as token hashes. Serve behind HTTPS, retain the SQLite database on persistent storage and back it up. Report photos are stored in the database.

For local device testing only, use HOST=0.0.0.0 python server.py on a trusted LAN and set the app's Server connection to http://YOUR-COMPUTER-LAN-IP:8080. HTTP is supported only by the debug app. Do not use real credentials over an untrusted HTTP network.

The existing backend Dockerfile builds from the backend directory and supports the Android API. Supply the same environment variables and mount a writable volume at /data. No host or mail service is provisioned by this source package.

## Maps and location

Leaflet 1.9.4 is bundled locally with its BSD-2-Clause license. Map tiles load from OpenStreetMap over HTTPS with visible attribution, normal WebView/browser caching and an app-identifying Android User-Agent. There is no tile prefetch or offline bulk download. Viewing maps sends the viewed tile area and normal connection metadata to the tile provider; the map dialog links to the provider's privacy policy. For a large deployment, choose a tile provider with suitable capacity and terms.

Android uses the system Geocoder for explicit place searches and reverse lookup. Search results must be selected; no first-result guess silently changes the location. GPS requires Android permission; map selection still works when permission is denied. Maps and address lookups need network connectivity. Tile failures show a message and coordinate/place search remains available.

The browser preview supports browser GPS coordinates, manual map selection and issue text search. Place-name lookup uses Android's native Geocoder; in the browser use the map or enter `latitude, longitude`. No browser geocoding provider is configured. The standalone backend Docker image contains only the API; serving the browser UI requires the full project tree.

## Verification

```bash
cd backend
python -m unittest test_server test_simple_flow test_moderation -q
cd ..
node tests/logic-test.cjs
npm install --no-save jsdom@26
node tests/ui-test.cjs
```

The UI test runs the bundled Leaflet library in a simulated DOM and mocks the Android bridge. It checks demo/real auth boundaries, reporting order, capture GPS, map selection, radius filtering, totals, resolution, profile changes, and delayed GPS responses. Actual Android camera, permission dialogs, map-tile delivery and email delivery need a physical-device check. No live email was sent by these tests.
