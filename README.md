# CivicFix 0.3 — reports, nearby issues and profile

Android 8.0+ community issue reporting. Version code 4, version name 0.3.0.

## Screens

- Home opens with one main **Report an Issue** button. The header contains **Issues** and a profile avatar with the first letter of the user's name. No report fields or GPS prompt appear until requested.
- Reporting order: **Category → Image (Capture / Upload) → Description (optional) → ETA**. The image section includes the GPS summary and current-GPS / map-selection controls. Title is generated from the category. Minimum/default ETA remains 7 days.
- Categories: Roads & Potholes, Electricity, Street Lighting, Cleaning & Waste, Drainage & Sewage, Water Supply, Construction & Debris, Footpaths & Accessibility, Parks & Public Spaces, Traffic Signs & Signals, Other.
- Capturing a photo refreshes the current GPS. An uploaded image needs current GPS or a manually selected map point. Coordinates and any available address are saved. A missing reverse-geocoded address does not discard valid coordinates.
- **Issues** opens **All issues**, initially within **3 km** of the current location. Adjust distance from 0.1 to 200 km, search a city/street/area, or select a map pin anywhere. **My reported Issues** lists all the current user's reports regardless of distance. Clicking Raised by lists that user's reports.
- Text search and status/country/city/street filters apply to the list and chart. Total = Open + Closed. Open includes overdue reports. The donut pie chart splits open within ETA (amber), overdue (red), and closed (green). Empty results show zero counts, not invented sample data.
- Issue details preserve original image and entered information, optional latest image, and reporter-only resolution. Closed issues stay green even if resolved late.
- The profile avatar opens editable name and email. Real account email changes require an OTP to the new email. Other device sessions are revoked after an email change. Demo profile changes stay within the current session.

## Temporary demo login

`DEMO_LOGIN=true` remains enabled as requested. Clicking Login opens an isolated demo without contacting the backend, even with blank fields. Demo reports and profile edits stay in memory and are cleared on logout or app restart. All issues in demo mode means reports created in that session; it is not a live global database.

Real signup remains available when a backend and SMTP sender are configured. Set `DEMO_LOGIN=false` in `android/app/src/main/assets/app.js` and rebuild to restore actual account login. Never remove backend authentication to simulate login.

## Build and install

The GitHub Actions **Build Android APK** workflow builds the Android app. After success, download **CivicFix-debug-apk**, unzip it and install `app-debug.apk`. A source update does not update an already installed APK. Debug signing keys can differ between runners; use consistent release signing before distributing the app.

For a real account, save your backend HTTPS address under **Server connection** on the login page. Deploy the updated backend along with this APK to enable new categories and profile updates. Existing user and issue records are preserved; legacy category inputs remain accepted.

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
python -m unittest test_server test_simple_flow -q
cd ..
node tests/logic-test.cjs
npm install --no-save jsdom@26
node tests/ui-test.cjs
```

The UI test runs the bundled Leaflet library in a simulated DOM and mocks the Android bridge. It checks demo/real auth boundaries, reporting order, capture GPS, map selection, radius filtering, totals, resolution, profile changes, and delayed GPS responses. Actual Android camera, permission dialogs, map-tile delivery and email delivery need a physical-device check. No live email was sent by these tests.
