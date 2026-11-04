import { describe, expect, it } from "bun:test";
import { formatUnsupportedMessage } from "../../src/tools/executor.ts";

describe("formatUnsupportedMessage", () => {
  it("names the running servers when none of them support the feature", () => {
    // Act
    const unsupportedMessage = formatUnsupportedMessage(
      "hoverProvider",
      [{ serverID: "oxlint" }],
      [{ serverID: "typescript", state: "unavailable", reason: "typescript not installed in project" }],
    );

    // Assert
    expect(unsupportedMessage).toBe(
      "No running LSP server for this file supports hover (running: oxlint). Not available: typescript: typescript not installed in project.",
    );
  });

  it("says no server is available when nothing runs for the file", () => {
    // Act
    const unsupportedMessage = formatUnsupportedMessage("definitionProvider", [], []);

    // Assert
    expect(unsupportedMessage).toBe("No LSP server available for this file type.");
  });
});
