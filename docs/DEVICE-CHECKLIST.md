# CivicFix 0.2 device checks

1. Build and install the new APK on Android 8.0+; connect to the deployed HTTPS backend using Server connection on the login screen.
2. Check that login has only email/password/Login/Create an account, with no bottom tabs.
3. Create an account with a name; send an email OTP. Verify actual delivery, wrong code, expired code, resend cooldown, and password mismatch behavior. Verify an unverified email cannot register.
4. Log in and check the two side-by-side buttons at narrow portrait width and with large system text.
5. Open Report an Issue. Test GPS permission allowed and denied, location services off, network unavailable, and a place with no returned street. Location fields must not allow typing.
6. Select a photo from the system picker and separately capture one. Cancel either flow, then retry. Check portrait/landscape orientation and that selecting a photo retains the title and description.
7. Submit with no description and default one-week ETA. Confirm no selection below one week exists. Reload My Reported Issues and confirm the stored details.
8. Check status/country/city/street filters individually and in combination; clear filters. Select a card and confirm its details open below the list. Tap Raised by and confirm only that person's records are shown.
9. Mark one issue resolved without a photo and another with a latest photo. Both turn green; original photos remain. A different account cannot close another reporter's issue.
10. Test an issue at its exact ETA boundary using controlled test data: amber before, red at/after, green after resolution even if late. Verify elapsed time stops at closure.
11. Log out and back in. Verify no previous user's issues remain on the new user's screen. Restart the app and verify session recovery.

A report's GPS is the phone's current location, not the location where an uploaded image was originally taken. Refresh GPS after moving. Signup requires a working backend and mail service; no local/offline account is created.
