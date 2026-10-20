# CivicFix 0.3 validation

- Python backend: 55 passing test executions, including inherited regression cases. Covers category-only reports, optional address with valid map coordinates, 3/5km radius filtering, invalid coordinate queries, profile ownership, verified email change, duplicate email rejection and session revocation, plus prior OTP/report/resolve cases.
- JavaScript syntax check: passed.
- Logic assertions: six status-boundary, elapsed-time and output-escaping checks passed.
- DOM integration: passed using jsdom 26 and the bundled real Leaflet 1.9.4 library. Simulated Android bridge; no external email, GPS or tile traffic.
- UI checks: empty-field demo login, home without expanded form, field order, capture triggers GPS, minimum ETA, report submission, closure, profile initial, 3km default/5km adjustment, invalid radius, filtered/empty chart counts, place selection, map pin including 0/0, denied GPS, map selection supersedes delayed GPS, session clearing, real signup OTP and profile email verification gate.
- Local browser screenshot test could not run because the Chromium download returned an invalid archive. No claim of physical device or live map/email validation.
- Android compilation is checked separately by the GitHub Actions build for version 0.3.0.
