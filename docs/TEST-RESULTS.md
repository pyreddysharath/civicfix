# Verification — 6 October 2026

## Completed

- 18 backend tests passed with a temporary SQLite database and actual encoded images.
- 7 frontend logic assertions passed: open, overdue, resolved, late resolution, equality at the deadline, elapsed duration and escaping untrusted HTML.
- JavaScript syntax checked with Node.
- Python source compiled to bytecode.
- Android manifest/resource XML parsed successfully.

AI acceptance tests use controlled, mocked provider outputs. A mock is used only in tests, not in the shipped service. Without credentials, the real service explicitly returns unavailable / pending review.

## Not verified here

- Android APK compilation: Android SDK, Gradle and the JDK compiler were not installed. A reproducible GitHub Actions build workflow is supplied, but has not been executed.
- Camera/GPS permissions and lifecycle on a physical Android device or emulator.
- Full UI browser rendering and the supplied Playwright regression test: Chromium was not installed and its download failed. No successful screenshot/render test is claimed.
- Live AI requests or AI accuracy on real civic issues.
- Hosted TLS, real-device networking, production load or deployment.

Before distributing an APK, run the build workflow and the device acceptance checks in DEVICE-CHECKLIST.md.
