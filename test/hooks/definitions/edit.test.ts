import { describe, expect, it } from "bun:test";
import { registerEditHook } from "../../../src/hooks/definitions/edit.ts";
import { parseOptions } from "../../../src/options.ts";
import { buildFakeDiagnostic } from "../../fixtures/diagnostics.ts";
import { FakeLspManager } from "../../fixtures/manager.ts";
import { buildFakeToolApi } from "../../fixtures/tool-api.ts";

describe("registerEditHook", () => {
  it("reports the other files a write broke, but not their old errors", async () => {
    // Arrange
    const manager = new FakeLspManager();
    manager.diagnosticsByFile = new Map([["/project/old.ts", [buildFakeDiagnostic("Old.")]]]);
    manager.diagnosticsAfterSync = new Map([
      ["/project/old.ts", [buildFakeDiagnostic("Old.")]],
      ["/project/b.ts", [buildFakeDiagnostic("Broken by the write.")]],
      ["/project/a.ts", [buildFakeDiagnostic("Own.")]],
    ]);
    const { toolApi, runHook } = buildFakeToolApi();
    await registerEditHook(toolApi, manager, "/project", parseOptions({}));

    // Act
    const content = await runHook({
      tool: "write",
      input: { path: "a.ts" },
      result: { output: { target: "/project/a.ts" }, content: "Wrote a.ts" },
    });

    // Assert
    expect(content).toStartWith("Wrote a.ts\n\nLSP errors detected in this file, please fix:");
    expect(content).toContain("Broken by the write.");
    expect(content).not.toContain("Old.");
  });

  it("only reports the edited file after an edit", async () => {
    // Arrange
    const manager = new FakeLspManager();
    manager.diagnosticsAfterSync = new Map([
      ["/project/a.ts", [buildFakeDiagnostic("Own.")]],
      ["/project/b.ts", [buildFakeDiagnostic("Elsewhere.")]],
    ]);
    const { toolApi, runHook } = buildFakeToolApi();
    await registerEditHook(toolApi, manager, "/project", parseOptions({}));

    // Act
    const content = await runHook({
      tool: "edit",
      input: { path: "a.ts" },
      result: { output: {}, content: "Edited a.ts" },
    });

    // Assert
    expect(content).toContain("Own.");
    expect(content).not.toContain("Elsewhere.");
  });

  it("leaves results alone for tools that change no files", async () => {
    // Arrange
    const { toolApi, runHook } = buildFakeToolApi();
    await registerEditHook(toolApi, new FakeLspManager(), "/project", parseOptions({}));

    // Act
    const content = await runHook({
      tool: "grep",
      input: { pattern: "x" },
      result: { output: {}, content: "1 match" },
    });

    // Assert
    expect(content).toBe("1 match");
  });
});
