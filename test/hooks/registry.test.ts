import { describe, expect, it } from "bun:test";
import { DEFAULT_HOOK_DEFINITIONS, getHookDefinitions } from "../../src/hooks/registry.ts";
import { parseOptions } from "../../src/options.ts";

describe("getHookDefinitions", () => {
  it("returns the edit and read hooks by default", () => {
    // Arrange
    const options = parseOptions({});

    // Act
    const hookDefinitions = getHookDefinitions(DEFAULT_HOOK_DEFINITIONS, options);

    // Assert
    expect(hookDefinitions.map((hook) => hook.name)).toEqual(["edit", "read"]);
  });

  it("leaves out disabled hooks", () => {
    // Arrange
    const options = parseOptions({ hooks: { read: { disabled: true } } });

    // Act
    const hookDefinitions = getHookDefinitions(DEFAULT_HOOK_DEFINITIONS, options);

    // Assert
    expect(hookDefinitions.map((hook) => hook.name)).toEqual(["edit"]);
  });
});
