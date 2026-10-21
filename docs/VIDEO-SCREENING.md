# Nenu Saitham 0.5.0 — media support

Capture opens a Photo / Video choice. Upload accepts JPEG, PNG, WebP, MP4, MOV and WebM. Video duration must be at most 10 seconds and the file at most 10 MiB. The Android camera receives these limits; the client and backend validate the result. Image cropping remains available for photos. Camera captures request current GPS; the map can adjust it.

Videos play in report previews, issue details and optional resolution evidence. The server converts videos to silent H.264 MP4, removes metadata and audio, and creates a JPEG thumbnail. Audio is intentionally not published or moderated in this version. The UI states this before submission. A device must have a compatible camera app and video decoder.

## Enable live screening

1. Deploy the updated backend Docker image behind HTTPS with persistent /data storage. FFmpeg is installed by the Dockerfile.
2. Set OPENAI_API_KEY as a secret on that backend. Never put it in Android assets, GitHub source or a browser. Configure SMTP separately for email OTP.
3. Set DEMO_LOGIN=false in android/app/src/main/assets/app.js and rebuild for real accounts. Connect the APK to the deployed HTTPS server through Server connection.
4. Allow JSON request bodies up to 15 MB at the reverse proxy and a request timeout of 240 seconds.

No server or provider key is provisioned by this code change. The test APK retains the previously requested demo login. Demo reports stay in memory, are explicitly unscanned, and are never sent to the backend.

Photos are normalized to a static JPEG, then checked by omni-moderation-latest. Video processing extracts two frames per second plus first and final frames and submits these to the same moderation provider. Flagged media is rejected. Missing configuration, provider failure and malformed responses block saving. Temporary processing files are removed on exit.

Sampling and automated moderation can miss offensive material and can incorrectly flag legitimate reports. This is not a guarantee that every frame is safe, nor an authenticity check. Live submissions send photos or sampled frames to OpenAI for screening. Video repair evidence from other contributors requires human review; the reporter may explicitly mark their own issue resolved.

## Validation

Automated tests exercise valid video normalization, silent output, duration/corrupt-file rejection, moderation failure cases, no persistence after rejection, resolution evidence, video previews and the existing issue/GPS/filter flows. GitHub Actions also compiles the Android APK. A physical-device check remains necessary for camera apps, file providers, GPS permissions and playback.

Download the successful workflow artifact named Nenu-Saitham-0.5.0-test-apk and extract app-debug.apk. Test builds use debug signing; permanent release signing is required for dependable upgrades without uninstalling. See RELEASE-SETUP.md.
