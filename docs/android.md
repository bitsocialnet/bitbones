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

Then add the keystore and its password to the repository so `.github/workflows/release.yml` can sign
the APK: the password goes in the `ANDROID_KEYSTORE_PASSWORD` secret, and the keystore itself has to
reach the runner (a base64 secret decoded in the workflow, or a self-hosted runner that already has
it). Until both exist, the android release job will fail at the `apksigner` step — every other
platform still releases normally.

Losing this key means the app can never be updated in place on a device, so back it up.
