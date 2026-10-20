# Version 0.4.1 setup

## Permanent APK signing

Keep application ID com.civicfix.app unchanged. Version code is now 6; increase it for each subsequent build. The workflow publishes CivicFix-0.4.1-test-apk on every push for immediate testing. This uses a temporary debug key and may require uninstalling an older build. It additionally publishes CivicFix-signed-apk when all four permanent signing secrets exist. Use the signed release for consistent future updates.

1. Use the ORIGINAL signing keystore if available. Otherwise create one permanent keystore in Android Studio (Build > Generate Signed Bundle / APK > APK > Create new). Keep an encrypted backup and its passwords; never commit them.
2. Base64-encode that keystore locally. Linux: `base64 -w 0 civicfix.jks > keystore-base64.txt`. On macOS: `base64 -i civicfix.jks -o keystore-base64.txt`. Treat the output as a secret.
3. In GitHub repository Settings > Secrets and variables > Actions, add repository secrets: ANDROID_KEYSTORE_BASE64 (encoded file), ANDROID_STORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD. Enter these yourself; do not send keys/passwords in chat.
4. Run Build Android APK in Actions. Download CivicFix-signed-apk after success and install app-release.apk.
5. Future APKs signed with this same key and higher version codes can replace that installation. A new release key cannot update an old debug-key installation. If the original key was not retained, that old install requires a one-time reinstall, which removes its local data. These changes do not provide automatic background updates.

## Photo screening

Deploy the updated backend and set OPENAI_API_KEY in the server host secret settings. All incoming report and proof images are normalized then sent to OpenAI omni-moderation-latest before database storage. Flagged images are rejected; missing configuration, malformed responses and provider outages block saving. No key belongs in the Android app. Demo login remains enabled: its local previews are unscanned and never sent to this backend.

Automated screening is imperfect, and image input does not support every moderation category. Add user reporting and human review for a public launch. Existing photos are not retroactively scanned. The present implementation screens images, not videos.

## Video proposal

A maximum 10-second clip is practical but is not included in 0.4. Add capture/import, server-enforced duration and file-size validation, private pending storage, video frame and audio screening, rejection cleanup and publication only after approval. Duration checks in the mobile UI alone are insufficient. Do not accept videos through the image-only endpoint.

## Device verification still needed

Check capture cancellation, image crop/apply/cancel, approximate/precise GPS and denied permissions, manual map correction, uploaded portrait images, search by fields without GPS, and install-over-existing using the original signing certificate. Android uses the system camera and document picker, with temporary file access, plus runtime location permission. No broad storage permission is needed.
