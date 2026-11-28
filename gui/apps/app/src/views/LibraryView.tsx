import {
  FILE_LIST_QUERY_MAX_LENGTH,
  findLocalPathProjectSourceForHost,
  isWindowsHostPath,
} from "@cloudroom/domain";
import type { SidebarBootstrapResponse } from "@cloudroom/server-contract";
import { Icon } from "@cloudroom/shared-ui/icon";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ProjectFilePreviewTabContent,
  ThreadStorageFilePreviewTabContent,
} from "@/components/right-panel/shell/file-preview-tabs";
import { Button } from "@cloudroom/shared-ui/button";
import { Input } from "@cloudroom/shared-ui/input";
import { useSidebarNavigation } from "@/hooks/queries/sidebar-navigation-query";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useHostDaemon } from "@/hooks/useHostDaemon";
import { useLocalOpenTargets } from "@/hooks/useLocalOpenTargets";
import {
  buildAbsoluteFilePath,
  getAbsoluteDirname,
  isAbsoluteFilePathWithinRoot,
  normalizeAbsoluteFilePath,
} from "@/lib/absolute-file-path";
import type { MarkdownLinkRouting } from "@/components/ui/markdown-link-routing";
import { fetchWithAppSurface } from "@/lib/app-surface";
import {
  buildProjectFileContentUrl,
  buildThreadStorageRawContentUrl,
} from "@/lib/file-content-urls";
import { sdk } from "@/lib/sdk";
import { buildOpenInEditorHandler } from "./thread-detail/threadWorkspaceOpenPath";

const PAGE_LIMIT = "100";

type SidebarProject = SidebarBootstrapResponse["projects"][number];

async function saveLibraryFile(url: string, filename: string): Promise<void> {
  // Use the normal authenticated app fetch. A browser download navigation can
  // arrive without the app surface used for protected file reads.
  const response = await fetchWithAppSurface(url);
  if (!response.ok) throw new Error("Library file download failed");
  const blobUrl = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    link.click();
  } finally {
    // Give compact browsers time to start reading the blob before revoking it.
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
  }
}

function LocalProjectFiles({
  project,
  hostId,
  rootPath,
}: {
  project: SidebarProject;
  hostId: string;
  rootPath: string;
}) {
  const [search, setSearch] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [failedDownloadPath, setFailedDownloadPath] = useState<string | null>(
    null,
  );
  const query = useDebouncedValue(search.trim(), 200);
  const { canOpenPreferredFileTarget, openPathInPreferredFileTarget } =
    useLocalOpenTargets({ enabled: selectedPath !== null });
  const files = useQuery({
    queryKey: ["library", "project-files", project.id, hostId, rootPath, query],
    queryFn: ({ signal }) =>
      sdk.projects.files({
        projectId: project.id,
        hostId,
        ...(query ? { query } : {}),
        limit: PAGE_LIMIT,
        signal,
      }),
  });
  const activeFile =
    !files.isError &&
    files.data?.files.find((file) => file.path === selectedPath);
  const normalizedRoot = normalizeAbsoluteFilePath({ path: rootPath });
  let markdownLinkRouting: MarkdownLinkRouting | undefined;
  const listedFiles = files.data?.files;
  if (activeFile && listedFiles && normalizedRoot !== null) {
    markdownLinkRouting = {
      localFile: {
        absoluteLinks: { kind: "contained", rootPath: normalizedRoot },
        relativeLinks: {
          rootPath: normalizedRoot,
          baseDir: getAbsoluteDirname({
            path: buildAbsoluteFilePath({
              rootPath: normalizedRoot,
              path: activeFile.path,
            }),
          }),
        },
        onOpenLink: ({ path }) => {
          if (
            !isAbsoluteFilePathWithinRoot({
              candidatePath: path,
              rootPath: normalizedRoot,
            })
          )
            return false;
          const relative = path.slice(
            normalizedRoot === "/" ? 1 : normalizedRoot.length + 1,
          );
          const listPath = isWindowsHostPath(normalizedRoot)
            ? relative.replaceAll("\\", "/")
            : relative;
          if (!listedFiles.some((file) => file.path === listPath)) return false;
          setSelectedPath(listPath);
          return true;
        },
      },
    };
  }
  const openInEditor = buildOpenInEditorHandler({
    rootPath,
    canOpenPreferredTarget: canOpenPreferredFileTarget,
    openInPreferredTarget: openPathInPreferredFileTarget,
  });

  return (
    <div className="grid min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(14rem,1fr)_minmax(0,2fr)]">
      <section
        aria-label="Project files"
        className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border"
      >
        <div className="flex items-center gap-2 border-b p-3">
          <Input
            aria-label="Find files"
            placeholder="Find files…"
            maxLength={FILE_LIST_QUERY_MAX_LENGTH}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={files.isFetching}
            onClick={() => void files.refetch()}
          >
            Refresh
          </Button>
        </div>
        {files.isPending ? (
          <p role="status" className="m-3 text-sm text-muted-foreground">
            Loading files…
          </p>
        ) : null}
        {files.isError ? (
          <p role="alert" className="m-3 text-sm text-muted-foreground">
            Could not load this project’s files. Make sure its folder is still
            connected, then choose Refresh.
          </p>
        ) : null}
        {files.isSuccess && files.data.files.length === 0 ? (
          <p className="m-3 text-sm text-muted-foreground">
            {query ? "No matching files." : "No files in this project."}
          </p>
        ) : null}
        {files.isSuccess && files.data.files.length > 0 ? (
          <ul className="max-h-64 min-h-0 overflow-auto p-1 lg:max-h-none">
            {files.data.files.map((file) => (
              <li key={file.path}>
                <button
                  type="button"
                  aria-pressed={
                    activeFile ? file.path === activeFile.path : false
                  }
                  className="flex w-full min-w-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-ring aria-pressed:bg-accent"
                  onClick={() => setSelectedPath(file.path)}
                >
                  <span className="min-w-0 break-all">{file.path}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {files.isSuccess && files.data.truncated ? (
          <p className="border-t p-3 text-xs text-muted-foreground">
            Only the first {PAGE_LIMIT} matches are shown. Search to narrow the
            results.
          </p>
        ) : null}
      </section>
      <section
        aria-label="File preview"
        className="flex min-h-72 min-w-0 flex-col overflow-hidden rounded-lg border"
      >
        {activeFile ? (
          <>
            <div className="flex items-center justify-between gap-2 border-b p-3">
              <p className="min-w-0 truncate text-sm font-medium">
                {activeFile.name}
              </p>
              <Button
                type="button"
                className="shrink-0"
                variant="outline"
                size="sm"
                disabled={downloadingPath !== null}
                onClick={() => {
                  setDownloadingPath(activeFile.path);
                  setFailedDownloadPath(null);
                  void saveLibraryFile(
                    buildProjectFileContentUrl(project.id, activeFile.path, {
                      hostId,
                    }),
                    activeFile.name,
                  )
                    .catch(() => {
                      setFailedDownloadPath(activeFile.path);
                    })
                    .finally(() => {
                      setDownloadingPath(null);
                    });
                }}
              >
                {downloadingPath === activeFile.path
                  ? "Downloading…"
                  : "Download"}
              </Button>
            </div>
            {failedDownloadPath === activeFile.path ? (
              <p
                role="alert"
                className="border-b p-3 text-sm text-muted-foreground"
              >
                Could not download this file. Make sure its project folder is
                connected and try again.
              </p>
            ) : null}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
              <ProjectFilePreviewTabContent
                key={activeFile.path}
                activePath={activeFile.path}
                environmentId={null}
                hostId={hostId}
                isPanelOpen
                lineRange={null}
                markdownLinkRouting={markdownLinkRouting}
                projectId={project.id}
                rootPath={rootPath}
                onOpenInEditor={openInEditor}
              />
            </div>
          </>
        ) : (
          <p className="m-4 text-sm text-muted-foreground">
            Select a file to preview it.
          </p>
        )}
      </section>
    </div>
  );
}

type SidebarSession = SidebarProject["threads"][number];

function LocalSessionFiles({
  session,
  hostId,
}: {
  session: SidebarSession;
  hostId: string;
}) {
  const [path, setPath] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<
    "idle" | "running" | "failed"
  >("idle");
  const files = useQuery({
    queryKey: [
      "library",
      "session-files",
      session.projectId,
      hostId,
      session.id,
      session.environmentId,
    ],
    queryFn: async ({ signal }) => {
      const location = await sdk.threads.storageLocation({
        threadId: session.id,
        signal,
      });
      if (location.hostId !== hostId)
        throw new Error("Session is not on this computer");
      const list = await sdk.threads.storageFiles({
        threadId: session.id,
        limit: PAGE_LIMIT,
        signal,
      });
      const current = await sdk.threads.storageLocation({
        threadId: session.id,
        signal,
      });
      if (
        current.hostId !== hostId ||
        current.storageRootPath !== location.storageRootPath ||
        list.storageRootPath !== location.storageRootPath
      ) {
        throw new Error("Session storage moved while files were loading");
      }
      return list;
    },
  });
  const active = files.isSuccess
    ? files.data.files.find((file) => file.path === path)
    : undefined;

  return (
    <div className="grid min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(14rem,1fr)_minmax(0,2fr)]">
      <section
        aria-label="Files in this session"
        className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border"
      >
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <span className="text-sm font-medium">Files in this session</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={files.isFetching}
            onClick={() => {
              setPath(null);
              setDownloadStatus("idle");
              void files.refetch();
            }}
          >
            Refresh
          </Button>
        </div>
        {files.isPending ? (
          <p role="status" className="m-3 text-sm text-muted-foreground">
            Loading session files…
          </p>
        ) : null}
        {files.isError ? (
          <p role="alert" className="m-3 text-sm text-muted-foreground">
            Could not load files from this session on this computer.
          </p>
        ) : null}
        {files.isSuccess && files.data.files.length === 0 ? (
          <p className="m-3 text-sm text-muted-foreground">
            No files in this session.
          </p>
        ) : null}
        {files.isSuccess && files.data.files.length > 0 ? (
          <ul className="max-h-64 min-h-0 overflow-auto p-1 lg:max-h-none">
            {files.data.files.map((file) => (
              <li key={file.path}>
                <button
                  type="button"
                  aria-pressed={file.path === active?.path}
                  className="w-full break-all rounded-md px-3 py-2 text-left text-sm hover:bg-accent aria-pressed:bg-accent"
                  onClick={() => {
                    setPath(file.path);
                    setDownloadStatus("idle");
                  }}
                >
                  {file.path}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {files.isSuccess && files.data.truncated ? (
          <p className="border-t p-3 text-xs text-muted-foreground">
            Only the first {PAGE_LIMIT} files are shown.
          </p>
        ) : null}
      </section>
      <section
        aria-label="Session file preview"
        className="flex min-h-72 min-w-0 flex-col overflow-hidden rounded-lg border"
      >
        {active ? (
          <>
            <div className="flex items-center justify-between gap-2 border-b p-3">
              <p className="min-w-0 truncate text-sm font-medium">
                {active.name}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={downloadStatus === "running"}
                onClick={() => {
                  setDownloadStatus("running");
                  void (async () => {
                    const location = await sdk.threads.storageLocation({
                      threadId: session.id,
                    });
                    if (
                      location.hostId !== hostId ||
                      location.storageRootPath !== files.data?.storageRootPath
                    ) {
                      throw new Error("Session storage moved");
                    }
                    await saveLibraryFile(
                      buildThreadStorageRawContentUrl(session.id, active.path),
                      active.name,
                    );
                  })().then(
                    () => setDownloadStatus("idle"),
                    () => setDownloadStatus("failed"),
                  );
                }}
              >
                {downloadStatus === "running" ? "Downloading…" : "Download"}
              </Button>
            </div>
            {downloadStatus === "failed" ? (
              <p
                role="alert"
                className="border-b p-3 text-sm text-muted-foreground"
              >
                Could not download this session file. Refresh the file list and
                try again.
              </p>
            ) : null}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
              <ThreadStorageFilePreviewTabContent
                key={active.path}
                activePath={active.path}
                threadId={session.id}
                isPanelOpen
                lineRange={null}
              />
            </div>
          </>
        ) : (
          <p className="m-4 text-sm text-muted-foreground">
            Select a session file to preview it.
          </p>
        )}
      </section>
    </div>
  );
}

function LocalLibrarySources({
  project,
  hostId,
  rootPath,
}: {
  project: SidebarProject;
  hostId: string;
  rootPath: string;
}) {
  const [source, setSource] = useState("project");
  const [sessionId, setSessionId] = useState("");
  const sessions = project.threads.filter(
    (thread) =>
      thread.projectId === project.id &&
      thread.environmentHostId === hostId &&
      thread.environmentId &&
      thread.executionTarget !== "cloud" &&
      !thread.deletedAt,
  );
  const active = sessions.find((session) => session.id === sessionId);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          aria-pressed={source === "project"}
          variant={source === "project" ? "secondary" : "outline"}
          onClick={() => setSource("project")}
        >
          Project files
        </Button>
        <Button
          type="button"
          size="sm"
          aria-pressed={source === "session"}
          variant={source === "session" ? "secondary" : "outline"}
          onClick={() => setSource("session")}
        >
          Session files
        </Button>
        {source === "session" && sessions.length > 0 ? (
          <label className="flex min-w-0 max-w-full items-center gap-2 text-sm font-medium">
            Session
            <select
              className="min-w-0 rounded-md border bg-background px-3 py-2 text-foreground"
              value={active?.id ?? ""}
              onChange={(event) => setSessionId(event.currentTarget.value)}
            >
              <option value="" disabled>
                Choose a local session
              </option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title ?? session.titleFallback ?? "Untitled session"}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {source === "project" ? (
        <LocalProjectFiles
          project={project}
          hostId={hostId}
          rootPath={rootPath}
        />
      ) : active ? (
        <LocalSessionFiles
          key={JSON.stringify([active.id, active.environmentId])}
          session={active}
          hostId={hostId}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {sessions.length === 0
            ? "No local sessions for this project."
            : "Choose a session to see its stored files."}
        </p>
      )}
    </>
  );
}

export default function LibraryView() {
  const navigation = useSidebarNavigation();
  const { localHostId } = useHostDaemon();
  const [projectId, setProjectId] = useState<string | null>(null);
  const sources =
    localHostId && navigation.data?.projects
      ? navigation.data.projects.flatMap((project) => {
          const source = findLocalPathProjectSourceForHost(
            project.sources,
            localHostId,
          );
          return source ? [{ project, source }] : [];
        })
      : [];
  const active =
    projectId === null
      ? sources[0]
      : sources.find(({ project }) => project.id === projectId);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Icon name="FolderOpen" aria-hidden="true" /> Library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Find and preview files in projects on this computer.
          </p>
        </div>
        {sources.length > 0 ? (
          <label className="flex min-w-0 max-w-full items-center gap-2 text-sm font-medium">
            Project
            <select
              className="min-w-0 rounded-md border bg-background px-3 py-2 text-foreground"
              value={active?.project.id ?? ""}
              onChange={(event) => setProjectId(event.currentTarget.value)}
            >
              {!active ? (
                <option value="" disabled>
                  Choose a project
                </option>
              ) : null}
              {sources.map(({ project }) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>
      {navigation.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading projects…
        </p>
      ) : navigation.isError ? (
        <p role="alert" className="text-sm text-muted-foreground">
          Could not load projects.{" "}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void navigation.refetch()}
          >
            Retry
          </Button>
        </p>
      ) : !localHostId ? (
        <p className="text-sm text-muted-foreground">
          Connect this computer to see its project files.
        </p>
      ) : sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Open a local project to see its files here.
        </p>
      ) : active ? (
        <LocalLibrarySources
          key={JSON.stringify([
            active.project.id,
            localHostId,
            active.source.path,
          ])}
          project={active.project}
          hostId={localHostId}
          rootPath={active.source.path}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Choose a project to open its files.
        </p>
      )}
    </div>
  );
}
