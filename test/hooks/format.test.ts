import { describe, expect, it } from "bun:test";
import { formatDiagnosticsSignature, formatDiagnosticsReport } from "../../src/hooks/format.ts";
import { buildFakeDiagnostic, buildFakeEditedFileDiagnostics } from "../fixtures/diagnostics.ts";

describe("formatDiagnosticsReport", () => {
  it("formats the edited file's errors like v1", () => {
    // Arrange
    const diagnostics = [
      buildFakeDiagnostic("Cannot find name 'x'.", 1, 2),
      buildFakeDiagnostic("Unused variable.", 2),
    ];

    // Act
    const diagnosticsReport = formatDiagnosticsReport("edit", [buildFakeEditedFileDiagnostics({ diagnostics })], [], 1);

    // Assert
    expect(diagnosticsReport).toBe(
      "\n\nLSP errors detected in this file, please fix:\n" +
        `<diagnostics file="/project/src/a.ts">\nERROR [3:1] Cannot find name 'x'.\n</diagnostics>`,
    );
  });

  it("includes warnings and says diagnostics when the threshold is warning", () => {
    // Act
    const diagnosticsReport = formatDiagnosticsReport(
      "edit",
      [buildFakeEditedFileDiagnostics({ diagnostics: [buildFakeDiagnostic("Unused.", 2)] })],
      [],
      2,
    );

    // Assert
    expect(diagnosticsReport).toStartWith("\n\nLSP diagnostics detected in this file");
    expect(diagnosticsReport).toContain("WARN [1:1] Unused.");
  });

  it("treats diagnostics without severity as errors", () => {
    // Act
    const diagnosticsReport = formatDiagnosticsReport(
      "edit",
      [buildFakeEditedFileDiagnostics({ diagnostics: [buildFakeDiagnostic("Broken.")] })],
      [],
      1,
    );

    // Assert
    expect(diagnosticsReport).toContain("ERROR [1:1] Broken.");
  });

  it("caps a file at 20 diagnostics and counts the rest", () => {
    // Arrange
    const diagnostics = Array.from({ length: 23 }, (_, index) => buildFakeDiagnostic(`error ${index}`, 1));

    // Act
    const diagnosticsReport = formatDiagnosticsReport("edit", [buildFakeEditedFileDiagnostics({ diagnostics })], [], 1);

    // Assert
    expect(diagnosticsReport).toContain("error 19");
    expect(diagnosticsReport).not.toContain("error 20");
    expect(diagnosticsReport).toContain("... and 3 more");
  });

  it("returns nothing when the file is clean and every server answered", () => {
    // Act
    const diagnosticsReport = formatDiagnosticsReport(
      "edit",
      [buildFakeEditedFileDiagnostics({ diagnostics: [buildFakeDiagnostic("hint", 4)] })],
      [],
      1,
    );

    // Assert
    expect(diagnosticsReport).toBe("");
  });

  it("notes each server whose diagnostics are incomplete", () => {
    // Arrange
    const failures = [
      { serverID: "typescript", reason: "did not respond within 5s" },
      { serverID: "pyright", reason: "crashed 4 times" },
    ];

    // Act
    const diagnosticsReport = formatDiagnosticsReport("edit", [buildFakeEditedFileDiagnostics({ failures })], [], 1);

    // Assert
    expect(diagnosticsReport).toBe(
      "\n\nLSP diagnostics for src/a.ts are incomplete (typescript: did not respond within 5s). Re-check later or run the project's type checker." +
        "\n\nLSP diagnostics for src/a.ts are incomplete (pyright: crashed 4 times). Re-check later or run the project's type checker.",
    );
  });

  it("gives every file of a patch its own heading", () => {
    // Arrange
    const editedFiles = [
      buildFakeEditedFileDiagnostics({
        file: "/project/a.ts",
        label: "a.ts",
        diagnostics: [buildFakeDiagnostic("A.", 1)],
      }),
      buildFakeEditedFileDiagnostics({
        file: "/project/b.ts",
        label: "b.ts",
        diagnostics: [buildFakeDiagnostic("B.", 1)],
      }),
    ];

    // Act
    const diagnosticsReport = formatDiagnosticsReport("patch", editedFiles, [], 1);

    // Assert
    expect(diagnosticsReport).toContain("LSP errors detected in a.ts, please fix:");
    expect(diagnosticsReport).toContain("LSP errors detected in b.ts, please fix:");
  });

  it("adds other files after the edited file, at most 5 of them", () => {
    // Arrange
    const otherFiles = ["a", "b", "c", "d", "e", "f"].map((name) => ({
      file: `/project/${name}.ts`,
      diagnostics: [buildFakeDiagnostic("Broken.", 1)],
    }));

    // Act
    const diagnosticsReport = formatDiagnosticsReport(
      "write",
      [buildFakeEditedFileDiagnostics({ diagnostics: [buildFakeDiagnostic("Own.", 1)] })],
      otherFiles,
      1,
    );

    // Assert
    expect(diagnosticsReport).toStartWith("\n\nLSP errors detected in this file, please fix:");
    expect(diagnosticsReport.match(/LSP errors detected in other files:/g)).toHaveLength(5);
    expect(diagnosticsReport).not.toContain("/project/f.ts");
  });

  it("stops listing other files after 30 diagnostics in total", () => {
    // Arrange
    const many = Array.from({ length: 25 }, (_, index) => buildFakeDiagnostic(`error ${index}`, 1));
    const otherFiles = ["/project/a.ts", "/project/b.ts", "/project/c.ts"].map((file) => ({ file, diagnostics: many }));

    // Act
    const diagnosticsReport = formatDiagnosticsReport("write", [], otherFiles, 1);

    // Assert
    expect(diagnosticsReport).toContain('<diagnostics file="/project/a.ts">');
    expect(diagnosticsReport).toContain("... and 5 more");
    expect(diagnosticsReport).toContain('<diagnostics file="/project/b.ts">');
    expect(diagnosticsReport).toContain("... and 15 more");
    expect(diagnosticsReport).not.toContain("/project/c.ts");
  });
});

describe("formatDiagnosticsSignature", () => {
  it("ignores order and diagnostics below the threshold", () => {
    // Arrange
    const first = [buildFakeDiagnostic("a", 1), buildFakeDiagnostic("b", 1), buildFakeDiagnostic("hint", 4)];
    const second = [buildFakeDiagnostic("b", 1), buildFakeDiagnostic("a", 1)];

    // Act
    const firstSignature = formatDiagnosticsSignature(first, 1);
    const secondSignature = formatDiagnosticsSignature(second, 1);

    // Assert
    expect(firstSignature).toBe(secondSignature);
  });

  it("changes when a diagnostic changes", () => {
    // Act
    const firstSignature = formatDiagnosticsSignature([buildFakeDiagnostic("a", 1)], 1);
    const secondSignature = formatDiagnosticsSignature([buildFakeDiagnostic("b", 1)], 1);

    // Assert
    expect(firstSignature).not.toBe(secondSignature);
  });
});
