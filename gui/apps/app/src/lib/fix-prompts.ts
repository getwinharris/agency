import { COMPUTER } from "@cloudroom/domain";
import { DESKTOP_DOWNLOAD_URL } from "@/hooks/useDesktopUpdateInfo";

const said = (text?: string | null) =>
  text?.trim() ? `: "${text.trim().replace(/\s+/g, " ").slice(0, 400)}".` : ".";

/** A technical error as one short, plain line for a banner. The full text stays in its tooltip and the fix prompt. */
export const plainError = (error: string) =>
  error.includes("storage unsafe")
    ? "Cloud disk is full"
    : error === "Cloudroom request cancelled or timed out"
      ? "Cloud didn't answer in time"
      : error.replace(/^Cloudroom rejected the request \(HTTP \d+\): /, "");

const fixPrompt = (problem: string, look: string) =>
  `${problem} ${look} Find the root cause and fix it without losing any work, then tell me what was wrong. Try \`bapx-agents-cli\` if \`room-cli\` is unavailable.`;

export const cloudThreadFixPrompt = (threadId: string, agent: string, error?: string | null) =>
  fixPrompt(
    `My Cloudroom Cloud thread ${threadId} (${agent}) failed${said(error)}`,
    `Investigate with \`room-cli thread show ${threadId}\` and \`room-cli vm run '<command>'\` on my cloud VM.`,
  );

export const syncFixPrompt = (state: string, issue?: string | null) =>
  fixPrompt(
    `Cloudroom's automatic sync between this computer and my cloud VM is not working (state: ${state})${said(issue)}`,
    "Check `room-cli cloud status --json`, ~/.bapx-agents/cloudroom-sync/, and the logs in ~/.bapx-agents/logs/.",
  );

export const projectFilesFixPrompt = (threadId: string, error?: string | null) =>
  fixPrompt(
    `Cloudroom could not move my work to the cloud for thread ${threadId}${said(error)}`,
    `Check \`room-cli thread show ${threadId}\` and \`room-cli cloud thread-workspace ${threadId}\`, then copy any missing project files with \`room-cli vm push\`.`,
  );

export const cloudUnavailableFixPrompt = (error?: string | null) =>
  fixPrompt(
    `My Cloudroom desktop app cannot reach my cloud VM${said(error)}`,
    "Check `room-cli cloud status --json`, then run `room-cli vm run 'systemctl status cloudroom --no-pager; df -h'` if the VM answers.",
  );

export const crashFixPrompt = (error: string) =>
  fixPrompt(
    `The Cloudroom desktop app crashed${said(error)}`,
    "Check the logs in ~/.bapx-agents/logs/ and `room-cli status --json`.",
  );

export const phoneCrashFixPrompt = (error: string, host: string, page: string, macOff: boolean) =>
  `The Cloudroom phone app (${host}) crashed on ${page} while my ${COMPUTER} was ${macOff ? "off" : "on"}${said(error)} Tell me what most likely went wrong and how to get it working again. If my ${COMPUTER} is on, check \`room-cli status --json\` there.`;

export const appUpdateFixPrompt = (current: string, latest: string | null) =>
  `Update bapX Agents from ${current} to ${latest ?? "the latest version"}. Use the signed bapX Agents installer for this computer from ${DESKTOP_DOWNLOAD_URL}. Quit bapX Agents before installing, preserve the runtime profile, reopen the app, and confirm the version.`;
