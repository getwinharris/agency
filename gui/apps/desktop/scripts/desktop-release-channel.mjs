const DESKTOP_RELEASE_CHANNEL_ENV_NAME = "BB_DESKTOP_RELEASE_CHANNEL";

export const BAPX_DESKTOP_SCHEME = "bapx-agents";
export const BAPX_DESKTOP_UPDATE_BASE_URL =
  "https://github.com/getwinharris/agency/releases/download/desktop-latest/";

export function resolveDesktopReleaseChannel(env) {
  const rawChannel = env[DESKTOP_RELEASE_CHANNEL_ENV_NAME]?.trim();
  if (rawChannel === undefined || rawChannel.length === 0) {
    return "latest";
  }
  if (rawChannel === "latest" || rawChannel === "nightly") {
    return rawChannel;
  }

  throw new Error(
    `${DESKTOP_RELEASE_CHANNEL_ENV_NAME} must be latest or nightly, got ${rawChannel}.`,
  );
}

export function resolveDesktopBuildPlatform(nodePlatform) {
  if (nodePlatform === "darwin") {
    return "macos";
  }
  if (nodePlatform === "linux") {
    return "linux";
  }
  if (nodePlatform === "win32") {
    return "windows";
  }

  throw new Error(
    `Desktop builds support darwin, linux, and win32 only, got ${nodePlatform}.`,
  );
}

export function createDesktopReleaseConfig(channel) {
  if (channel === "nightly") {
    return {
      appId: "in.bapx.agents.nightly",
      applicationName: "bapX Agents Nightly",
      artifactName: "bapx-agents-nightly-v${version}-${arch}.${ext}",
      dataDirectoryName: ".bapx-agents-nightly",
      localServerPort: 39890,
      localDaemonPort: 39891,
      iconFileName: "icon-nightly.png",
      linuxDesktopName: "bapx-agents-nightly.desktop",
      // The Linux binary name must differ from stable so both channels can be
      // installed at once without one shadowing the other on PATH.
      linuxExecutableName: "bapx-agents-nightly",
      macIconPath: "assets/icon-nightly.icns",
      releaseTag: "desktop-nightly",
      updateMetadataFileNames: {
        linux: "nightly-linux.yml",
        macos: "nightly-mac.yml",
        windows: "nightly.yml",
      },
      // electron-builder names the per-user install folder after the package:
      // %LOCALAPPDATA%\Programs\bapx-agents-nightly.
      windowsInstallName: "bapx-agents-nightly",
    };
  }

  return {
    appId: "in.bapx.agents",
    applicationName: "bapX Agents",
    artifactName: "bapx-agents-v${version}-${arch}.${ext}",
    dataDirectoryName: ".bapx-agents",
    localServerPort: 39888,
    localDaemonPort: 39889,
    iconFileName: "icon.png",
    linuxDesktopName: "bapx-agents.desktop",
    linuxExecutableName: "bapx-agents",
    macIconPath: "assets/icon.icns",
    releaseTag: "desktop-latest",
    updateMetadataFileNames: {
      linux: "latest-linux.yml",
      macos: "latest-mac.yml",
      windows: "latest.yml",
    },
    windowsInstallName: "bapx-agents",
  };
}
