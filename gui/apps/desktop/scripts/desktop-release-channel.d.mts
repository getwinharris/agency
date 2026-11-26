export type DesktopReleaseChannel = "latest" | "nightly";

export const BAPX_DESKTOP_SCHEME: "bapx-agents";
export const BAPX_DESKTOP_UPDATE_BASE_URL: string;
export type DesktopBuildPlatform = "macos" | "linux" | "windows";

export interface DesktopUpdateMetadataFileNames {
  linux: "latest-linux.yml" | "nightly-linux.yml";
  macos: "latest-mac.yml" | "nightly-mac.yml";
  windows: "latest.yml" | "nightly.yml";
}

export interface DesktopReleaseConfig {
  appId: "in.bapx.agents" | "in.bapx.agents.nightly";
  applicationName: "bapX Agents" | "bapX Agents Nightly";
  artifactName: string;
  dataDirectoryName: ".bapx-agents" | ".bapx-agents-nightly";
  localServerPort: number;
  localDaemonPort: number;
  iconFileName: "icon.png" | "icon-nightly.png";
  linuxDesktopName: "bapx-agents.desktop" | "bapx-agents-nightly.desktop";
  linuxExecutableName: "bapx-agents" | "bapx-agents-nightly";
  macIconPath: "assets/icon.icns" | "assets/icon-nightly.icns";
  releaseTag: "desktop-latest" | "desktop-nightly";
  updateMetadataFileNames: DesktopUpdateMetadataFileNames;
  windowsInstallName: "bapx-agents" | "bapx-agents-nightly";
}

export function resolveDesktopReleaseChannel(
  env: NodeJS.ProcessEnv,
): DesktopReleaseChannel;

export function resolveDesktopBuildPlatform(
  nodePlatform: string,
): DesktopBuildPlatform;

export function createDesktopReleaseConfig(
  channel: DesktopReleaseChannel,
): DesktopReleaseConfig;
