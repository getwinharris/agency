export const BAPX_CLI_NAME = "bapx-cli";

export const RESERVED_BB_CLI_COMMANDS: readonly string[] = [
  "browser",
  "cloud",
  "environment",
  "file",
  "guide",
  "help",
  "import",
  "machine",
  "manager",
  "marketplace",
  "plugin",
  "project",
  "provider",
  "report",
  "settings",
  "skill",
  "status",
  "terminal",
  "theme",
  "thread",
  "updates",
  "vm",
  "voice",
];

export function pluginCliCall(pluginId: string, name: string): string {
  if (RESERVED_BB_CLI_COMMANDS.includes(name))
    return `${BAPX_CLI_NAME} plugin run ${pluginId}`;
  return `${BAPX_CLI_NAME} ${name}`;
}

export function bapxCliUsage(usage: string): string {
  return usage.replace(/^(?:bb|room|cloudroom|room-cli)(?= |$)/u, BAPX_CLI_NAME);
}
