# RideShare Genesis — Android (Play Store TWA)

This wraps the live PWA at `https://ridesharegenesis.app` in a Trusted Web
Activity (TWA): a thin native Android shell with no browser address bar,
backed by Google's `androidbrowserhelper` library. There is no separate
native app to maintain — every screen the user sees is the same web app
already deployed; shipping an update to the site ships the "app" too. The
only things that live in this `android/` folder are the shell, the app
icon, and the signing identity Play Store requires.

This project could not be scaffolded with the official `bubblewrap init`
wizard inside the build sandbox — Bubblewrap's setup wizard requires an
interactive terminal (raw-mode stdin) that isn't available there. Instead
these files were hand-authored to match Bubblewrap's own generated project
layout. Both paths below produce the same result.

## What already exists

- `twa-manifest.json` — Bubblewrap's own config format. If you have
  Bubblewrap and the Android SDK installed locally, this alone is enough
  to regenerate or update this project (see Path A).
- `app/` — a standalone Gradle project (Path B) you can open directly in
  Android Studio or build with plain `gradle`, no Bubblewrap required.
- `frontend/public/.well-known/assetlinks.json` — the Digital Asset Links
  file that tells Chrome "this Android app is authorized to represent this
  website," which is what actually removes the browser chrome. It ships
  automatically with every frontend build/deploy, same as the PWA manifest.
- Launcher icons at every density, generated from the existing PWA icons
  (`frontend/public/icon-512.png` / `icon-maskable-512.png`) — nothing to
  redo here unless the app icon changes.
- A release signing keystore, generated once and sent to you directly
  (never committed to this repo — see **Signing key custody** below).

## Path A — Bubblewrap (recommended if you have it)

On a machine with the Android SDK + a JDK 17 installation:

```
npm install -g @bubblewrap/cli
cd android
bubblewrap build
```

Bubblewrap reads `twa-manifest.json`, asks for your keystore path/passwords
once, and produces a signed `.aab` ready for Play Console upload.

## Path B — Plain Gradle / Android Studio

1. Install Android Studio (bundles the SDK) or a standalone Android SDK +
   command-line tools.
2. Open the `android/` folder in Android Studio, or from a terminal with
   `ANDROID_HOME` set:
   ```
   cd android
   gradle bundleRelease
   ```
3. Place your keystore alongside this folder (e.g. `android/android.keystore`)
   and copy `keystore.properties.example` to `keystore.properties` with the
   real passwords — `build.gradle` picks it up automatically and signs the
   release build. Without it, `bundleRelease` still produces an unsigned
   `.aab`.
4. The output lands at `android/app/build/outputs/bundle/release/app-release.aab`.

## Signing key custody

A signing keystore was generated in the build sandbox (`keytool -genkeypair`,
RSA 2048, 30-year validity) and delivered to you directly as a file — it is
**not** in this repository, on purpose. Whoever holds it can publish updates
to this app forever; whoever loses it can never update it again once it's
live on the Play Store, with no recovery path. Store it somewhere durable
and private (password manager file storage, encrypted drive, physical
backup) — not in Slack, email, or a shared drive without encryption.

The SHA-256 fingerprint of that keystore is already published at
`frontend/public/.well-known/assetlinks.json`. **This fingerprint is only
valid if you sign the actual Play Store release with this same keystore
directly** (Path A/B above, opting out of Play App Signing where offered).

If instead you enroll in **Play App Signing** (Google's default and
recommended option for all new apps since 2021 — Google holds the
distribution-signing key, you only hold an upload key), the certificate
Chrome needs to trust is a *different* one that Google Play generates after
your first upload:

1. Upload the `.aab` to Play Console (a closed/internal testing track is
   fine to start).
2. Go to **Setup → App integrity → App signing key certificate** and copy
   the SHA-256 fingerprint shown there.
3. Replace the fingerprint in `frontend/public/.well-known/assetlinks.json`
   with that value, then deploy the frontend as usual — the file is served
   straight from `ridesharegenesis.app/.well-known/assetlinks.json`, no
   Worker code changes needed.
4. Give it a few minutes, then verify with Google's own checker:
   `https://developers.google.com/digital-asset-links/tools/generator`.

Until the fingerprint on the live domain matches whatever actually signed
the installed APK, the app still works — it just opens inside visible
browser chrome (an address bar) instead of full-screen, which is a cosmetic
degradation, not a broken app.

## What I cannot do for you

Publishing is a human-only step from here:

- A **Google Play Developer account** — one-time $25 registration fee,
  identity verification, tied to a real Google account.
- The **store listing** itself — screenshots, a short/full description,
  privacy policy URL, content rating questionnaire, data-safety declaration.
  RideShare Genesis already collects location, payment, and identity-document
  data (see `docs/` for the existing privacy/compliance write-ups this can
  draw from), so the data-safety form should mirror what's already disclosed
  there rather than being drafted fresh.
- Submitting for review and responding to any Play Console policy feedback.

Once an account exists, uploading the `.aab` this project builds and
filling in the listing is the remaining work — nothing further needs to
change in this repository to get there, apart from the fingerprint swap
above if Play App Signing is used.
