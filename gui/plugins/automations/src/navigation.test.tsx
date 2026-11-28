// @vitest-environment jsdom

import { loadPluginApp } from "@get-bb/plugin-sdk/testing/app";
import { describe, expect, it } from "vitest";

describe("workspace Automations navigation", () => {
  it("labels the existing panel without changing its route or paused badge", async () => {
    const app = await loadPluginApp(() => import("../app"));
    expect(app.navPanels).toHaveLength(1);
    expect(app.navPanels[0]).toMatchObject({
      id: "automations",
      path: "automations",
      title: "Automations",
      icon: "Repeat",
      component: expect.any(Function),
      experimental_sidebarLabel: expect.any(Function),
    });
  });
});
