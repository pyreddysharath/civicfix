# Device acceptance checks

1. Install the debug APK on Android 8 and a current Android version. Check screen insets, keyboard resizing, rotation and system Back.
2. Connect two phones to the same HTTPS backend. Register different users.
3. Capture a report, grant precise location, confirm orientation, address and stored GPS accuracy. Publish on phone A; verify it appears on phone B.
4. Deny location permission. Confirm the photo can be saved as a draft and publication explains that GPS is missing.
5. Close/restart the app after saving a draft. Verify the photo and typed data remain. Clear app data only after confirming that this intentionally deletes local drafts.
6. Turn off networking while publishing. The draft must remain available. Retry once connected; only one report should exist for that draft ID.
7. Search by reporter username, city, state, street and country. Test two areas with the same city name using state/country terms where needed. Search is literal contiguous text, not a full geocoder.
8. View nearby reports from both sides of a 5 km boundary.
9. Set a short future deadline. Confirm an unresolved issue becomes red after the deadline, including while the screen stays open.
10. Submit an identical original as proof. It must not close. Submit an unrelated scene or distant GPS; it must remain open.
11. With AI configured, submit a real before/after repair pair. Review the recorded explanation. False or uncertain acceptance should be investigated and the issue reopened.
12. Accept an on-time proof; status and elapsed time should be green. Accept a late proof; status should be green and elapsed time red.
13. Upload proof from phone B. Confirm contributor attribution and search. Reopening is restricted to the original reporter; trusted operators can review via CLI.
14. Test landscape, large font accessibility, long addresses, non-Latin names, and a slow network.
15. Turn AI credentials off. Reports and proof must still save, with an explicit unavailable/pending message and no automatic closure.
16. Build a signed release APK. Confirm HTTP is rejected and HTTPS works. Keep the signing key outside the source repository.
