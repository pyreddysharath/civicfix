# CivicFix 0.2 validation — 10 October 2026

Passed locally:
- Python syntax compilation and JavaScript syntax check.
- 18 existing backend regression cases adapted to email signup and the seven-day ETA.
- 14 additional backend cases: unverified signup denied, code expiry, five-guess lockout, resending/cooldown, email binding, single-use verification, SMTP failure/missing settings, exact minimum ETA, optional description, reporter-only resolution, resolution with and without photos, invalid photo protection, combined filter behavior, deadline equality and reporter email privacy.
- 6 frontend logic assertions for amber/red/green boundaries, elapsed time and escaped output.
- DOM integration test with jsdom: login-first flow, OTP gate, edited-email invalidation, registration, no bottom tabs, two actions, read-only location, one-week ETA default/minimum, image selection, optional description, submission, colour classes, filters, inline details, optional-photo resolution, Raised by navigation, logout/login.

Not completed here:
- Android compilation is checked by the repository’s Build Android APK workflow. Consult the latest GitHub Actions run for the uploaded source revision; the local checks above do not compile an APK.
- Real device camera/document-picker permissions, GPS/geocoder results, installation and process recreation.
- Live SMTP delivery. Backend tests mock delivery, never send real messages, and do not ship a verification bypass.
- Screenshot-based mobile layout verification. Chromium download failed in this environment. DOM tests do not prove visual layout.
- Hosted backend deployment or end-to-end testing against a live mail provider.
