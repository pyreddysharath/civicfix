# CivicFix 0.3 device checklist

1. Install version 0.3.0. Click Login with blank fields: home shows Report an Issue; Issues and initial avatar are in the header. No GPS prompt until a location-related action.
2. Open Report an Issue. Confirm Category, Image, optional Description, ETA; default/minimum 7 days.
3. Capture an image, allow GPS, confirm location updates after capture. Capture a second photo from another location and confirm GPS refreshes. Deny GPS and confirm map selection remains available.
4. Upload an image, choose current GPS or a map point. Search a place, select the correct result, move the pin, confirm. Verify optional description and category appear in details.
5. Open Issues. Confirm All issues defaults to 3km around current GPS. Adjust radius, select a different country/city via search and map, and confirm results change. Check GPS-denied/no-network/empty-result messages.
6. Switch to My reported Issues; reports outside the nearby radius remain visible. Filter by text, status and address; pie chart and totals should match the filtered list. Open includes overdue; amber + red + green equals total.
7. Select a report, resolve with and without a latest photo; counts and green status update. Click Raised by to view all reports by that person.
8. Edit profile name and check the avatar and reporter name. Demo details are session-only. In real account mode verify new-email OTP is required and old email can no longer log in after a successful change.
9. Verify map attribution is visible, zoom/pan/pin placement work, hardware Back closes the map, and a delayed GPS result does not replace a confirmed map point.
10. To test shared data, deploy the updated backend, configure SMTP, disable DEMO_LOGIN and rebuild. Use two accounts/devices to confirm nearby shared reports and ownership restrictions. Verify data survives a backend restart with persistent storage configured.
