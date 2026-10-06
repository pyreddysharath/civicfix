# CivicFix — Android community issue reporting

Version 0.1.0. Working source project for a hosted pilot, not a published service or a compiled APK. The name is a placeholder you can change.

## What is implemented

- Android camera capture through the device camera, full-size JPEG scaled to 1600 pixels, GPS coordinates and reported accuracy. Location is attached as report metadata; unnecessary EXIF metadata is removed.
- Description, editable category, address and target deadline; optional AI image suggestions.
- Persistent local drafts before publication; sign-in and shared SQLite-backed reports after publication. Drafts require explicit publication, not automatic background sync.
- Home: the user's entries and status, with nearby open reports below (5 km radius).
- Search by street, city, state, country, title, description, reporter and proof contributor. Names mean registered display names / usernames, not identity recognition or allegations about people.
- Area totals and category/status filters. Search supports reports anywhere in the world on the connected server. It does not crawl government complaint databases or search all Internet reports.
- Original and repair photos side by side, with all proof submissions and an activity history.
- Any signed-in user can submit proof. Matching, clearly repaired scenes with AI confidence >= 0.95, GPS within 100 metres, accuracy <= 100 metres and recent capture metadata can close automatically. Identical originals are rejected. Uncertain checks remain open for operator review.
- Reopening by the original reporter; command-line operator review with audit notes.

## Status and time rules

| Situation | Issue status | Time taken |
|---|---|---|
| Open before deadline | Orange | Green |
| Deadline reached, unresolved | Red | Red once deadline is exceeded |
| Resolved at or before deadline | Green | Green |
| Resolved after deadline | Green | Red |

Time taken is elapsed wall-clock time from server creation to accepted closure, not worker labour time. While open, elapsed time continues. A reopened issue uses its original creation date and deadline. Accepted closure time is the server validation/review time, not an unverified photo timestamp. Deadlines are reporter-set community targets, not official service commitments. Cards refresh their time/status every minute while the page is open; the server computes status on every read.

## Build an APK

This delivery does **not** include an APK. This workspace had no Android SDK, JDK compiler or Gradle, so Android compilation and real-device operation have not been tested.

### Easiest reproducible build: GitHub Actions

1. Create a private repository and upload the **contents of CivicFix**, so `.github` and `android` are at the repository root. Ensure the hidden `.github` folder is included.
2. Open **Actions → Build Android APK → Run workflow**. The workflow also runs on push.
3. Download the **CivicFix-debug-apk** artifact after a successful run, unzip it and install `app-debug.apk` on an Android 8.0+ device.
4. Android will ask you to permit installation from the app opening the APK. This is a test build; release publishing needs your own signing key and release build.

The workflow installs Java 17, Gradle 8.11.1, Android SDK 35, and compiles with Android Gradle Plugin 8.9.2. It has been supplied but not run on your account.

### Android Studio

1. Install Android Studio, JDK 17, SDK platform 35 and build tools 35.0.0.
2. Open the **android** directory.
3. Use a local Gradle **8.11.1** installation in Gradle settings for the first sync. No downloaded Gradle wrapper binary is included in this ZIP.
4. Optionally run `gradle wrapper --gradle-version 8.11.1` in that directory to generate the usual wrapper.
5. Sync, then choose **Build → Build App Bundle(s) / APK(s) → Build APK(s)**, or run `gradle :app:assembleDebug`.
6. Output: `android/app/build/outputs/apk/debug/app-debug.apk`.

## Start the shared backend

Python 3.11+ is required. In a terminal:

```sh
cd backend
python -m venv .venv
# Linux/macOS:
. .venv/bin/activate
# Windows instead: .venv\Scripts\activate
pip install -r requirements.txt
python server.py
```

The development server listens at `127.0.0.1:8080`. On an Android emulator, enter `http://10.0.2.2:8080` in **Settings → Server address**. A physical test phone needs the computer's LAN IP, the same network and `HOST=0.0.0.0`; allow the port only on a trusted LAN. HTTP is allowed only in debug builds. Do not use a real password over an untrusted HTTP connection.

For a hosted pilot, use the Dockerfile or Gunicorn, a persistent `/data` volume, backups and an HTTPS reverse proxy. The release app permits HTTPS only.

```sh
cd backend
# Set OPENAI_API_KEY and OPENAI_VISION_MODEL through your hosting platform's secret settings.
# Use a currently available vision-capable model in your API account.
gunicorn --bind 0.0.0.0:8080 --workers 2 --threads 4 --timeout 150 server:application
```

Set `CIVICFIX_DB` to a writable persistent path. The default is `backend/civicfix.sqlite3`. Photos are stored inside SQLite with the reports; preserve the database and use SQLite's online backup API for backups. All clients must use the same backend URL to see each other's reports. This project does not provision or pay for hosting.

## Enable AI

Set both `OPENAI_API_KEY` and `OPENAI_VISION_MODEL` on the **server only**. The integration uses `https://api.openai.com/v1/responses`, JSON output, and image inputs. Set a model that supports image input and JSON output in your account. There is no API key in the Android app. AI calls may incur API usage charges.

Without those settings, report capture, publication, search and proof uploads still work. The app explicitly reports that AI is unavailable. Proof remains open for review; it is never silently treated as validated. Live provider calls were not performed during testing. Integration tests substitute controlled provider responses to check acceptance and refusal behavior.

Confidence is a model judgment, not a calibrated guarantee. Two images and phone GPS cannot prove that a location was repaired: GPS and timestamps are client-supplied, images can be misleading, and hidden structural defects cannot be assessed from a photo. Accepted proof retains an audit trail and the reporter can reopen the issue. Calibrate acceptance thresholds against real local photos before enabling unattended closure at scale.

## First use on the phone

1. Open Settings and save the shared server's HTTPS URL.
2. Create an account using a display name, unique username and password of at least 10 characters.
3. Tap **Report**. Capture the problem, permit location access, review the address, describe the issue and choose a deadline.
4. Confirm sharing consent. Optionally tap **Analyse photo**, review the suggestions, then publish.
5. Tap **Locate me** on Home to view nearby reports. Explore searches any area or contributor on this server.
6. Open a report and submit proof after a repair. Use the same angle and include permanent landmarks. Proof photo and GPS must be captured in the app.

If reverse geocoding is unavailable, fill the street/city/state/country manually. If location permission is denied or GPS is unavailable, save a draft and retake the photo once GPS is available. Approximate location is supported, but accuracy worse than 100 metres requires operator review for closure. No background location is collected.

## Review uncertain proof

A trusted server operator can list pending submissions:

```sh
cd backend
python review.py list
python review.py accept --proof PROOF_ID --operator operator-name --reason "Inspected both photos and confirmed repair on site"
python review.py reject --proof PROOF_ID --operator operator-name --reason "Different location shown"
```

Use the same `CIVICFIX_DB` as the running service. To inspect the photos, open the returned issue ID in the app using search. The CLI is a trusted server administration operation and is not exposed as a public HTTP endpoint. A moderation dashboard is not included.

## Tests and preview

```sh
cd backend
python -m unittest -v
```

18 automated backend tests cover authentication, durable report/photo storage, retry deduplication, worldwide text search, area totals, radius filtering, pagination, deadline boundaries, accepted/uncertain/reused proof, contributor search, late closure, reopening, invalid input and session expiry.

The bundled mobile web interface can be previewed without compiling Android:

```sh
python -m http.server 8765 --directory android/app/src/main/assets
```

Open `http://localhost:8765`. This is a browser preview of the app's bundled UI. It supports local drafts; authenticated networking is supplied by the Android bridge. A browser cannot sign into the backend through this preview. The optional UI test produces screenshots when run with an installed browser.

Frontend logic checks (no extra dependency):

```sh
node tests/logic-test.cjs
```

Optional UI regression test (install Playwright and its Chromium browser first):

```sh
node tests/ui-test.cjs
```

Run it from the project root while the preview server is running. See `docs/TEST-RESULTS.md` for completed checks and untested areas.

## Scope before a public launch

This is a functional pilot source project. It is not a production-scale worldwide platform. Account recovery, email verification, account/data deletion workflows, abuse reporting, face/number-plate redaction, notifications, authority routing, map browsing, duplicate issue clustering, multilingual geocoding, Android process-death recovery during camera capture and a moderator UI remain future work. Local draft photos are lost if app data is cleared or the app is uninstalled. Pending proof exists only in the current screen until uploaded; retry it before leaving.

The backend has password hashing, opaque expiring sessions, parameterized SQL, upload limits, basic per-account/IP rate limits, EXIF stripping and a closure audit trail. Before opening registration broadly, add anti-abuse controls and recovery, operator access policy, privacy/deletion processes, monitoring and backups. Configure proxy-level size, connection and rate limits. Search currently scans matching reports for geographic filtering and aggregation; move to PostgreSQL/PostGIS and object storage when usage grows. The phone WebView runs only bundled app resources, with no navigation to external pages.

## References used for implementation

- Android Gradle plugin compatibility: https://developer.android.com/build/releases/agp-8-9-0-release-notes
- Android camera intents: https://developer.android.com/media/camera/camera-deprecated/photobasics
- OpenAI image inputs: https://developers.openai.com/api/docs/guides/images-vision
