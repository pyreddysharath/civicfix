# Nenu Saitham 0.6.0

- Removes pie charts, image cropping and the Show all issues toggle. Lists start with all issues and retain keyword/status filtering.
- Keeps Total/Open/Closed buttons. Zero-count buttons are disabled without changing the list.
- Numbers visible issue rows and places an accessible information button at the right. Its details expand immediately below that row; the same control collapses it.
- Requires photo or video evidence before a reporter can mark an issue resolved. Enforced in demo UI and backend; submitted media still passes the existing server screening path. Previously resolved records remain readable and retries remain idempotent.
- Renames Search to Search Issues. Separates current GPS, place search and map selection into three choices; the editable radius still defaults to 3 km.
- Lowers the header by another 16 px (32 px top spacing total) and adds an inline wooden torch icon.

Validation: 65 backend tests and UI integration checks passed locally; CI repeats these checks and compiles Android. Demo login remains enabled and unscanned, as in previous builds. Existing deployment/signing requirements remain applicable.
