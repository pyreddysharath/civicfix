# CivicFix 0.2 — simplified Android app

A simple login and reporting flow. The bottom navigation tabs have been removed.

## Screens

- Login: Email ID, Password, Login, and Create an account.
- Create an account: email OTP, Verify email, Name, Password and Confirm password. Name supplies the Raised by field.
- Landing page: Report an Issue and My Reported Issues, side by side.
- Report an Issue: uploaded image or camera photo, required title, optional description, GPS-detected read-only country/state/city/street, and ETA. Default and minimum ETA: seven days from successful server creation.
- My Reported Issues: current user's reports with status, country, city and street filters. Click an issue to expand its details below the list. Click Raised by to list that person's reports.
- The reporter may mark an issue resolved with or without a latest photo. Both original and supplied latest photos remain visible.

Status is **amber** while unresolved before ETA, **red** when ETA is reached or passed, and **green** once resolved. Resolved status remains green even for a late fix. The detail view includes the original data, creation time, ETA, elapsed time or time taken, and resolution time.

Resolution in the new flow is the reporter's confirmation; it does not claim independent or AI verification. Legacy proof-review API endpoints remain for existing data/clients but are absent from the new interface. New reporting does not make AI calls.

## Build and install

1. Upload this ZIP's contents to the repository root, preserving `.github`, `android`, `backend`, `docs`, and `tests`. Replace matching files. Do not upload just the ZIP or put everything inside another directory.
2. GitHub Actions → Build Android APK. A push starts a build, or run it manually.
3. After success, download the CivicFix-debug-apk artifact. Unzip and install app-debug.apk on an Android 8.0+ device.
4. On the login screen expand Server connection and save your deployed backend's HTTPS base address. Sign up, verify your email, then log in.

This release increments versionCode to 2 and versionName to 0.2.0. It must be rebuilt; an older APK will not contain these changes. GitHub's previous successful 0.1 build does not validate this release. GitHub runners may generate different debug signing keys across builds; if an update says the signatures differ, use a consistently signed build or uninstall the old test app (which clears its local data).

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

## Location and photo behavior

Android requests foreground location and uses the platform Geocoder to populate the address. GPS and address fields are read-only. Country and city must be available before submission; enable location/network access and retry if detection fails. Street/state may be unavailable in the geocoder's results and are shown as Not available without a fabricated value. Uploaded photos use the phone's current report location, not unverified photo EXIF coordinates. Refresh GPS if you change location before submitting.

Photos can be selected through Android's system document picker or captured with the camera. Images are resized and normalized before storage. The app asks for no broad photo-library storage permission. The optional resolution photo need not contain GPS metadata.

## Existing users and records

The database migration adds the email verification table without dropping existing reports, users or sessions. Existing signed-in sessions remain usable. New login uses email; old username-only accounts need an operator-assisted verified email migration to preserve the same user ID. Creating a separate account will not automatically claim another account's existing reports. Local drafts from the earlier interface are not deleted but are not shown by the new login-first interface.

## Browser and testing

Running the backend from the full project tree also serves the bundled interface at its root for preview and account/list testing. The Android app is the complete reporting target: browser GPS-to-address lookup is not configured in this package. Browser reporting shows an explicit message to use Android. The standalone backend Docker image contains only the API.

Run regression checks:

```bash
cd backend
python -m unittest test_server test_simple_flow -q
cd ..
node tests/logic-test.cjs
npm install --no-save jsdom@26
node tests/ui-test.cjs
```

The UI integration test uses a simulated Android bridge and mocked email/server responses. See docs/TEST-RESULTS.md for tested and untested areas, and docs/DEVICE-CHECKLIST.md before distributing the APK.
