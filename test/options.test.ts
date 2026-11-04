import { describe, expect, it } from "bun:test";
import { parseOptions } from "../src/options.ts";

describe("parseOptions", () => {
  it("enables LSP with error severity when no options are given", () => {
    // Act
    const options = parseOptions(undefined);

    // Assert
    expect(options).toEqual({
      enabled: true,
      severity: 1,
      idleTimeoutMs: 600_000,
      diagnosticsTimeoutMs: 5000,
      servers: {},
      tools: {},
      hooks: {},
    });
  });

  it("disables LSP when enabled is false", () => {
    // Act
    const options = parseOptions({ enabled: false });

    // Assert
    expect(options.enabled).toBe(false);
  });

  it.each<[unknown, number]>([
    ["warning", 2],
    ["hint", 4],
    ["loud", 1],
    [3, 1],
  ])("maps severity %p to %d", (severity, expected) => {
    // Act
    const options = parseOptions({ severity });

    // Assert
    expect(options.severity as number).toBe(expected);
  });

  it("falls back to the default timeouts when they are invalid", () => {
    // Act
    const options = parseOptions({ idleTimeout: -1, diagnosticsTimeout: "fast" });

    // Assert
    expect(options.idleTimeoutMs).toBe(600_000);
    expect(options.diagnosticsTimeoutMs).toBe(5000);
  });

  it("keeps a zero idle timeout so idle shutdown can be turned off", () => {
    // Act
    const options = parseOptions({ idleTimeout: 0 });

    // Assert
    expect(options.idleTimeoutMs).toBe(0);
  });

  it("keeps valid server fields and drops invalid ones", () => {
    // Act
    const options = parseOptions({
      servers: {
        typescript: { disabled: true },
        custom: { command: ["custom", "--stdio"], extensions: [".x"], env: { A: 1 }, root: ["x.toml"] },
        broken: "nope",
      },
    });

    // Assert
    expect(options.servers).toEqual({
      typescript: { disabled: true },
      custom: { command: ["custom", "--stdio"], extensions: [".x"] },
    });
  });

  it("keeps only the disabled field of tool and hook overrides", () => {
    // Act
    const options = parseOptions({
      tools: { lsp_hover: { disabled: true }, lsp_definition: { command: ["x"] }, broken: "nope" },
      hooks: { edit: { disabled: "yes" }, read: { disabled: true } },
    });

    // Assert
    expect(options.tools).toEqual({ lsp_hover: { disabled: true }, lsp_definition: {} });
    expect(options.hooks).toEqual({ edit: {}, read: { disabled: true } });
  });
});
