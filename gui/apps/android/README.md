# bapX Agents for Android

The Android app opens an existing bapX Agents workspace over HTTPS in the
phone’s browser session. Sign-in cookies stay with that browser. The hosted
workspace owns project access, thread creation and reconnection. Keep the
workspace service and its agent runtime available independently of a desktop.

## Build a signed APK

Install a JDK and Python 3. Set `ANDROID_HOME` to a local Android SDK
with API 36 and build-tools 36.0.0.

```bash
sdkmanager 'platforms;android-36' 'build-tools;36.0.0' platform-tools
```

Set `BAPX_ANDROID_WORKSPACE_URL` to the verified HTTPS address of the hosted
**bapX Agents workspace**. Confirm that it handles account sign-in and agent
threads without a desktop running. Marketing, documentation, MediaHub, and
Admin are separate services.

Supply `BAPX_ANDROID_KEYSTORE`, `BAPX_ANDROID_KEY_ALIAS`, and
`BAPX_ANDROID_KEYSTORE_PASSWORD` using the release signing environment. Set
`BAPX_ANDROID_KEY_PASSWORD` when the key uses a different password. Keep the
same owner-managed signing key across updates.

```bash
bash gui/apps/android/build.sh
```

The command verifies the signature and writes
`gui/apps/android/dist/bapx-agents-v0.1.0-android.apk`. The package ID is
`in.bapx.agents`. For a release, increase `versionCode` in `AndroidManifest.xml`
and set the corresponding `versionName`.

## Verify on a device

Install the signed file with `adb install -r` on a test device. Open bapX Agents,
sign in to the workspace, and check that the same account remains connected
after closing and reopening the app. With the desktop off, reopen an existing
thread, check its status, and start a short new task on the hosted agent.
