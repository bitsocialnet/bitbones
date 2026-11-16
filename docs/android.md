#### How to add Android app to project using https://capacitorjs.com/docs/getting-started

1.
```
npx cap init
npx cap add android
npx cap sync
```

2. Put icons in android/icons
```
yarn android:build:icons
```

3. Create a release signing key.

bitbones does **not** ship a keystore — the release workflow needs one that belongs to this app.
Generate it once and keep it out of the repo (`android/*.keystore` is gitignored):

```
keytool -genkey -v -keystore android/bitbones.keystore -keyalg RSA -keysize 2048 -validity 10000 -alias release
```

Store the base64-encoded keystore in the repository's `ANDROID_KEYSTORE_BASE64` Actions secret and
its password in `ANDROID_KEYSTORE_PASSWORD`. The [release workflow](../.github/workflows/release.yml)
decodes the keystore on the runner and signs the APK with the `release` alias. Do not commit the
keystore or password.

If either secret is absent, the current workflow skips signing and publishes an explicitly named
unsigned APK, which must be signed before installation. If signing or any platform build fails,
the final GitHub release job is skipped; it waits for Linux, macOS, Windows, and Android to succeed.

Losing this key means the app can never be updated in place on a device, so back it up.
