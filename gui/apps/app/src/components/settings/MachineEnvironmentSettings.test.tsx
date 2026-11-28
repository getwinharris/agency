// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MachineEnvironmentList } from "@cloudroom/server-contract";
import { MachineEnvironmentSettings } from "./MachineEnvironmentSettings";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  replace: vi.fn(),
  connection: vi.fn(),
}));
vi.mock("@/hooks/queries/cloudroom-queries", () => ({
  useCloudroomConnection: () => ({ data: mocks.connection() }),
}));
vi.mock("@/hooks/queries/system-queries", () => ({
  useSystemConfig: () => ({
    data: { generalSettings: { machineGitCredentialsEnabled: true } },
  }),
}));
vi.mock("@/hooks/mutations/settings-mutations", () => ({
  useUpdateGeneralSettings: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("@/lib/sdk", () => ({
  sdk: {
    system: {
      machineEnvironment: mocks.list,
      replaceMachineEnvironment: mocks.replace,
    },
  },
}));
vi.mock("@/hooks/cache-owners/system-cache-effects", () => ({
  invalidateSystemConfig: vi.fn(),
}));
afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());

async function show(
  status: MachineEnvironmentList["builtInGit"]["status"] = "logged in",
) {
  mocks.list.mockResolvedValue({
    builtInGit: { status, statusMessage: "Git status" },
    variables: [{ name: "API_KEY", value: null, secret: true, note: null }],
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MachineEnvironmentSettings />
    </QueryClientProvider>,
  );
  await screen.findByDisplayValue("API_KEY");
}

it.each([true, false])(
  "shows private Core environment guidance when readiness is %s",
  async (ready) => {
    mocks.connection.mockReturnValue({ selfHosted: true, ready });
    await show();

    const guide = screen.getByRole("link", { name: "Private Core environment setup" });
    expect(guide.getAttribute("href")).toBe(
      "https://docs.bapx.in/private-core/#agent-environment-on-a-private-core",
    );
  },
);

it("keeps hosted connections on the plugin-machine guidance", async () => {
  mocks.connection.mockReturnValue({ selfHosted: false, ready: true });
  await show();

  expect(screen.queryByRole("link", { name: "Private Core environment setup" })).toBeNull();
});

it("stages additions and preserves an unchanged saved secret", async () => {
  mocks.connection.mockReturnValue({ selfHosted: true, ready: false });
  await show();
  fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
  fireEvent.change(screen.getByLabelText("Variable name 2"), {
    target: { value: "NEW_VALUE" },
  });
  fireEvent.change(screen.getByLabelText("Value for NEW_VALUE"), {
    target: { value: "example" },
  });
  expect(mocks.replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save variables" }));
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith({
      variables: [
        { name: "API_KEY", value: null, note: null },
        { name: "NEW_VALUE", value: "example", note: null },
      ],
    }),
  );
});

it("stages removal and lets users discard it without deleting", async () => {
  await show();
  expect(screen.queryByRole("link", { name: "Private Core environment setup" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove API_KEY" }));
  expect(screen.queryByDisplayValue("API_KEY")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(screen.getByDisplayValue("API_KEY")).toBeTruthy();
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("retains a secret replacement when saving fails", async () => {
  await show();
  mocks.replace.mockRejectedValue(new Error("offline"));
  fireEvent.change(screen.getByLabelText("Value for API_KEY"), {
    target: { value: "replacement" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save variables" }));
  await screen.findByText(/Some changes could not be saved/);
  expect(screen.getByDisplayValue("replacement")).toBeTruthy();
});
