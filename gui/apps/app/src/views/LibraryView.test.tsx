// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LibraryView from "./LibraryView";

const mocks = vi.hoisted(() => ({
  localHostId: "host-local" as string | null,
  list: vi.fn(),
  download: vi.fn(),
  sessionList: vi.fn(),
  sessionLocation: vi.fn(),
}));

function project(id: string, name: string, hostId: string) {
  return {
    id,
    name,
    sources: [{ type: "local_path", hostId, path: `/fixtures/${id}` }],
    threads: [
      {
        id: `${id}-local`,
        projectId: id,
        environmentId: "env",
        environmentHostId: hostId,
        title: `${name} session`,
      },
      {
        id: `${id}-cloud`,
        projectId: id,
        executionTarget: "cloud",
        environmentId: "env",
        environmentHostId: hostId,
        title: "Cloud session",
      },
      {
        id: "remote",
        projectId: id,
        environmentId: "remote-env",
        environmentHostId: "host-remote",
        title: "Remote session",
      },
    ],
  };
}

vi.mock("@/hooks/queries/sidebar-navigation-query", () => ({
  useSidebarNavigation: () => ({
    data: {
      projects: [
        project("one", "First project", "host-local"),
        project("two", "Second project", "host-local"),
        project("cloud", "Remote project", "host-remote"),
      ],
    },
    isError: false,
    isPending: false,
  }),
}));
vi.mock("@/hooks/useHostDaemon", () => ({
  useHostDaemon: () => ({ localHostId: mocks.localHostId }),
}));
vi.mock("@/hooks/useLocalOpenTargets", () => ({
  useLocalOpenTargets: () => ({ canOpenPreferredFileTarget: false }),
}));
vi.mock("@/lib/app-surface", () => ({
  fetchWithAppSurface: mocks.download,
}));
vi.mock("@/lib/sdk", () => ({
  sdk: {
    projects: { files: mocks.list },
    threads: {
      storageFiles: mocks.sessionList,
      storageLocation: mocks.sessionLocation,
    },
  },
}));
vi.mock("@/components/right-panel/shell/file-preview-tabs", () => ({
  ThreadStorageFilePreviewTabContent: ({
    activePath,
    threadId,
  }: {
    activePath: string;
    threadId: string;
  }) => (
    <span>
      {threadId}/{activePath}
    </span>
  ),
  ProjectFilePreviewTabContent: ({
    activePath,
    hostId,
    projectId,
  }: {
    activePath: string;
    hostId: string;
    projectId: string;
  }) => (
    <span>
      {projectId}/{hostId}/{activePath}
    </span>
  ),
}));

function renderLibrary() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: Infinity } },
        })
      }
    >
      <LibraryView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.localHostId = "host-local";
  mocks.download.mockReset().mockResolvedValue({ ok: false });
  mocks.sessionLocation.mockReset().mockResolvedValue({
    hostId: "host-local",
    storageRootPath: "/sessions/one",
  });
  mocks.sessionList.mockReset().mockResolvedValue({
    files: [{ name: "notes.md", path: "notes.md" }],
    truncated: false,
    storageRootPath: "/sessions/one",
  });
  mocks.list
    .mockReset()
    .mockImplementation(
      async ({ projectId, query }: { projectId: string; query?: string }) => ({
        files: (projectId === "one"
          ? ["README.md", "poster.svg"]
          : ["README.md", "second.txt"]
        )
          .filter((path) => !query || path.includes(query))
          .map((path) => ({ name: path, path })),
        truncated: false,
      }),
    );
});
afterEach(cleanup);

describe("Library workspace", () => {
  it("only lists this computer’s projects and resets same-named previews when switching", async () => {
    renderLibrary();
    const picker = screen.getByRole("combobox", { name: "Project" });
    expect(within(picker).queryByText("Remote project")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "README.md" }));
    expect(screen.getByText("one/host-local/README.md")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() =>
      expect(mocks.download).toHaveBeenCalledWith(
        "/api/v1/projects/one/files/content?path=README.md&hostId=host-local",
      ),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not download this file.",
    );
    fireEvent.change(picker, { target: { value: "two" } });
    expect(screen.queryByText("one/host-local/README.md")).toBeNull();
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
    expect(
      await screen.findByRole("button", { name: "second.txt" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "poster.svg" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "README.md" }));
    expect(screen.getByText("two/host-local/README.md")).toBeTruthy();
    expect(
      mocks.list.mock.calls.map(([{ projectId, hostId }]) => [
        projectId,
        hostId,
      ]),
    ).toEqual([
      ["one", "host-local"],
      ["two", "host-local"],
    ]);
  });

  it("gives size-limit guidance for a 413 response", async () => {
    mocks.download.mockResolvedValue({ ok: false, status: 413 });
    renderLibrary();
    fireEvent.click(await screen.findByRole("button", { name: "README.md" }));
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This file is too large to download from Library.",
    );
  });

  it("does not request files without a connected local host", () => {
    mocks.localHostId = null;
    renderLibrary();
    expect(
      screen.getByText("Connect this computer to see its project files."),
    ).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("searches the selected project and reports empty search results", async () => {
    renderLibrary();
    await screen.findByRole("button", { name: "poster.svg" });
    fireEvent.change(screen.getByRole("textbox", { name: "Find files" }), {
      target: { value: "missing" },
    });
    expect(await screen.findByText("No matching files.")).toBeTruthy();
    await waitFor(() =>
      expect(mocks.list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          projectId: "one",
          hostId: "host-local",
          query: "missing",
        }),
      ),
    );
    expect(screen.queryByRole("button", { name: "poster.svg" })).toBeNull();
  });
});

describe("Library session files", () => {
  function chooseSession() {
    fireEvent.click(screen.getByRole("button", { name: "Session files" }));
    const select = screen.getByLabelText("Session");
    fireEvent.change(select, { target: { value: "one-local" } });
    return select;
  }

  it("lists only local sessions in the selected project and resets the preview on project change", async () => {
    renderLibrary();
    const select = chooseSession();
    expect(within(select).queryByText("Cloud session")).toBeNull();
    expect(within(select).queryByText("Remote session")).toBeNull();
    expect(within(select).queryByText("Second project session")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "notes.md" }));
    expect(screen.getByText("one-local/notes.md")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: "two" },
    });
    expect(screen.queryByText("one-local/notes.md")).toBeNull();
  });

  it("does not read files if the current storage location is on a different host", async () => {
    mocks.sessionLocation.mockResolvedValue({
      hostId: "host-remote",
      storageRootPath: "/sessions/remote",
    });
    renderLibrary();
    chooseSession();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not load files",
    );
    expect(mocks.sessionList).not.toHaveBeenCalled();
  });

  it("discards a list if the session moves during the read", async () => {
    mocks.sessionLocation.mockResolvedValueOnce({
      hostId: "host-local",
      storageRootPath: "/sessions/one",
    });
    mocks.sessionLocation.mockResolvedValueOnce({
      hostId: "host-remote",
      storageRootPath: "/sessions/one",
    });
    renderLibrary();
    chooseSession();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not load files",
    );
    expect(screen.queryByRole("button", { name: "notes.md" })).toBeNull();
  });

  it("searches the selected session and not the project folder", async () => {
    renderLibrary();
    chooseSession();
    await screen.findByRole("button", { name: "notes.md" });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Find session files" }),
      {
        target: { value: "notes" },
      },
    );
    await waitFor(() =>
      expect(mocks.sessionList).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "notes",
          threadId: "one-local",
        }),
      ),
    );
    expect(mocks.list).not.toHaveBeenCalledWith(
      expect.objectContaining({ query: "notes" }),
    );
  });

  it("does not download the file when the selected session moves", async () => {
    renderLibrary();
    chooseSession();
    fireEvent.click(await screen.findByRole("button", { name: "notes.md" }));
    mocks.sessionLocation.mockResolvedValue({
      hostId: "host-remote",
      storageRootPath: "/sessions/one",
    });
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not download",
    );
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("shows size-limit guidance for an oversized session file", async () => {
    mocks.download.mockResolvedValue({ ok: false, status: 413 });
    renderLibrary();
    chooseSession();
    fireEvent.click(await screen.findByRole("button", { name: "notes.md" }));
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This session file is too large to download from Library.",
    );
  });
});
