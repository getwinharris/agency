import {
  FILE_LIST_QUERY_MAX_LENGTH,
  findLocalPathProjectSourceForHost,
  isWindowsHostPath,
} from "@cloudroom/domain";
import type { SidebarBootstrapResponse } from "@cloudroom/server-contract";
import { Icon } from "@cloudroom/shared-ui/icon";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ProjectFilePreviewTabContent } from "@/components/right-panel/shell/file-preview-tabs";
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
import { buildProjectFileContentUrl } from "@/lib/file-content-urls";
import { sdk } from "@/lib/sdk";
import { buildOpenInEditorHandler } from "./thread-detail/threadWorkspaceOpenPath";

const PAGE_LIMIT = "100";

type SidebarProject = SidebarBootstrapResponse["projects"][number];

class ProjectFileDownloadError extends Error {
  constructor(readonly status: number) {
    super("Project file download failed");
  }
}

async function saveProjectFile(url: string, filename: string): Promise<void> {
  // Use the normal authenticated app fetch. A browser download navigation can
  // arrive without the app surface used for protected file reads.
  const response = await fetchWithAppSurface(url);
  if (!response.ok) throw new ProjectFileDownloadError(response.status);
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
  const [downloadFailure, setDownloadFailure] = useState<{
    path: string;
    tooLarge: boolean;
  } | null>(null);
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
                  setDownloadFailure(null);
                  void saveProjectFile(
                    buildProjectFileContentUrl(project.id, activeFile.path, {
                      hostId,
                    }),
                    activeFile.name,
                  )
                    .catch((error: unknown) => {
                      setDownloadFailure({
                        path: activeFile.path,
                        tooLarge:
                          error instanceof ProjectFileDownloadError &&
                          error.status === 413,
                      });
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
            {downloadFailure?.path === activeFile.path ? (
              <p
                role="alert"
                className="border-b p-3 text-sm text-muted-foreground"
              >
                {downloadFailure.tooLarge
                  ? "This file is too large to download from Library. Open the project folder and copy it directly."
                  : "Could not download this file. Make sure its project folder is connected and try again."}
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
        <LocalProjectFiles
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
