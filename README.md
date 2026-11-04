# OpenCode LSP

[![Version](https://img.shields.io/npm/v/@tomdewildt/opencode-lsp?label=version)](https://www.npmjs.com/package/@tomdewildt/opencode-lsp)
[![Build](https://img.shields.io/github/actions/workflow/status/tomdewildt/opencode-lsp/ci.yml?branch=master)](https://github.com/tomdewildt/opencode-lsp/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/actions/workflow/status/tomdewildt/opencode-lsp/cd.yml?label=release)](https://github.com/tomdewildt/opencode-lsp/actions/workflows/cd.yml)
[![License](https://img.shields.io/github/license/tomdewildt/opencode-lsp)](https://github.com/tomdewildt/opencode-lsp/blob/master/LICENSE)

Plugin for [OpenCode](https://opencode.ai/) v2 that brings back language server support from v1: diagnostics are fed back to the agent after every edit, write and patch, the `lsp_*` tools give the agent code intelligence (definitions, references, hover, symbols and call hierarchy), and the sidebar shows which language servers are running.

# How To Run

Prerequisites:

- mise version `2025.1.0` or later
- bun version `1.4.0` or later
- opencode version `2.0.0` or later

### Development

1. Run `mise run init` to initialize the environment. This also installs every language server for the e2e tests into `.e2e/`.
2. Run `mise run test` to run all tests, or `mise run test:unit` and `mise run test:e2e` to run the unit and e2e tests separately. The e2e tests run the plugin against real language servers.
3. Run `mise run build` to bundle the plugin into `dist/`.

# How To Use

Add the plugin to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@tomdewildt/opencode-lsp"]
}
```

LSP is enabled as soon as the plugin is installed. Language servers start lazily when the agent reads or changes a file they handle, and are not installed automatically: install the server for your language (see [Servers](#servers)) and make sure it is on your `PATH`, in the project's `node_modules/.bin` or in the project's virtual environment.

### Configuration

Options go in the plugin entry.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "@tomdewildt/opencode-lsp",
      "options": {
        "severity": "warning",
        "servers": {
          "eslint": { "disabled": true },
          "rust": { "env": { "RUST_LOG": "debug" } },
          "custom-lsp": {
            "command": ["custom-lsp-server", "--stdio"],
            "extensions": [".custom"]
          }
        },
        "tools": {
          "lsp_call_hierarchy": { "disabled": true }
        },
        "hooks": {
          "read": { "disabled": true }
        }
      }
    }
  ]
}
```

| Option               | Default   | Description                                                                                                                                                           |
| -------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`            | `true`    | Set to `false` to turn off every language server.                                                                                                                     |
| `severity`           | `"error"` | Lowest severity reported to the agent: `error`, `warning`, `info` or `hint`.                                                                                          |
| `diagnosticsTimeout` | `5000`    | Milliseconds to wait for diagnostics after a change. When a server does not answer in time the agent is told the result is incomplete instead of seeing a clean file. |
| `idleTimeout`        | `600000`  | Milliseconds without use before a language server is stopped. It restarts on the next file it handles. `0` keeps servers running.                                     |
| `servers`            | `{}`      | Per-server overrides, keyed by server id.                                                                                                                             |
| `hooks`              | `{}`      | Turns hooks off: `edit` reports diagnostics after edits, `read` starts servers when a file is read.                                                                   |
| `tools`              | `{}`      | Turns tools off, keyed by tool name, e.g. `"lsp_hover": { "disabled": true }`.                                                                                        |

| Server field | Description                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `disabled`   | Turns the server off. `"ty": {}` turns on the opt-in `ty` server, which replaces `pyright`.                                              |
| `command`    | Command used to start the server. Required for custom servers, replaces detection for default ones.                                      |
| `extensions` | File extensions handled by the server. A server without extensions handles every file.                                                   |
| `env`        | Extra environment variables for the server process.                                                                                      |
| `options`    | Server options, sent when the server starts, e.g. `{ "preferences": { "importModuleSpecifierPreference": "relative" } }` for typescript. |

### Tools

| Tool                    | Input                       | Description                                                                  |
| ----------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `lsp_definition`        | `path`, `line`, `character` | Where the symbol is defined.                                                 |
| `lsp_references`        | `path`, `line`, `character` | All references to the symbol, including its declaration.                     |
| `lsp_hover`             | `path`, `line`, `character` | Documentation and type info for the symbol.                                  |
| `lsp_implementation`    | `path`, `line`, `character` | Implementations of an interface or abstract method.                          |
| `lsp_document_symbols`  | `path`                      | All symbols in the file.                                                     |
| `lsp_workspace_symbols` | `path`, `query`             | Project-wide symbols matching the query. `path` selects the language server. |
| `lsp_call_hierarchy`    | `path`, `line`, `character` | Call hierarchy item for the function.                                        |
| `lsp_incoming_calls`    | `path`, `line`, `character` | Functions that call the function.                                            |
| `lsp_outgoing_calls`    | `path`, `line`, `character` | Functions called by the function.                                            |

### Servers

The plugin looks for each server in the project's `node_modules/.bin`, then the project's virtual environment (`$VIRTUAL_ENV`, `.venv` or `venv`), then your `PATH`. A server that is not found shows as `not installed` in the sidebar.

A server is checked once per project per session. After installing one, restart OpenCode (`opencode service restart`) so it is picked up. Any other server can be added as a custom server through `servers`.

| Language               | Server                        |
| ---------------------- | ----------------------------- |
| Ansible                | [`ansible`](#ansible)         |
| Clojure                | [`clojure-lsp`](#clojure-lsp) |
| JavaScript, TypeScript | [`eslint`](#eslint)           |
| Go                     | [`gopls`](#gopls)             |
| JavaScript, TypeScript | [`oxlint`](#oxlint)           |
| Python                 | [`pyright`](#pyright)         |
| Python                 | [`ruff`](#ruff)               |
| Rust                   | [`rust`](#rust)               |
| Terraform              | [`terraform`](#terraform)     |
| Terraform              | [`tflint`](#tflint)           |
| Python                 | [`ty`](#ty)                   |
| JavaScript, TypeScript | [`typescript`](#typescript)   |

#### ansible

Ansible playbooks and roles (`.yml .yaml`), only below an `ansible.cfg` or `galaxy.yml`. Requires Ansible 2.9+ and Ansible Lint. [Docs](https://ansible.readthedocs.io/projects/vscode-ansible/als/).

```sh
npm install -g @ansible/ansible-language-server
```

#### clojure-lsp

Clojure (`.clj .cljs .cljc .edn`). [Docs](https://clojure-lsp.io/installation/)

Download `clojure-lsp-native-<os>-<arch>.zip` from the [latest release](https://github.com/clojure-lsp/clojure-lsp/releases/latest), unzip it and put `clojure-lsp` on your `PATH`.

#### eslint

ESLint for JavaScript, TypeScript and Vue, only in projects with an ESLint config (`eslint.config.*` or `.eslintrc*`) and `eslint` as a dependency. [Docs](https://github.com/hrsh7th/vscode-langservers-extracted).

```sh
npm i -g vscode-langservers-extracted
```

#### gopls

Go (`.go`). Requires Go 1.21+. Runs `go vet` and [staticcheck](https://staticcheck.dev/docs/checks/) checks. Turn staticcheck off with `"gopls": { "options": { "staticcheck": false } }`. [Docs](https://go.dev/gopls).

```sh
go install golang.org/x/tools/gopls@latest
```

#### oxlint

Oxlint for JavaScript and TypeScript, only in projects with an `.oxlintrc.json`. Must be installed in the project. [Docs](https://oxc.rs/docs/guide/usage/linter/editors).

```sh
npm add -D oxlint
```

#### pyright

Python (`.py .pyi`). Requires Node.js. Set the project's virtual environment with `venvPath` and `venv` in `pyrightconfig.json` or `[tool.pyright]`. [Docs](https://microsoft.github.io/pyright/#/installation).

```sh
npm install -g pyright
```

#### ruff

Ruff for Python, only in projects with a `ruff.toml`, `.ruff.toml` or `[tool.ruff]` in `pyproject.toml`. [Docs](https://docs.astral.sh/ruff/installation/).

```sh
uv tool install ruff@latest
```

#### rust

Rust (`.rs`), using rust-analyzer. Runs clippy on save when installed, `cargo check` otherwise. Use `cargo check` anyway with `"rust": { "options": { "check": { "command": "check" } } }`. [Docs](https://rust-analyzer.github.io/book/installation.html).

```sh
rustup component add rust-analyzer clippy
```

#### terraform

Terraform (`.tf .tfvars`). [Docs](https://github.com/hashicorp/terraform-ls/blob/main/docs/installation.md).

Download the archive for your platform from [releases.hashicorp.com](https://releases.hashicorp.com/terraform-ls/), unzip it and put `terraform-ls` on your `PATH`.

#### tflint

TFLint for Terraform, only in projects with a `.tflint.hcl`. [Docs](https://github.com/terraform-linters/tflint#installation)

```sh
go install github.com/terraform-linters/tflint@latest
```

#### ty

Python (`.py .pyi`), instead of pyright. Off by default, enable it with `"servers": { "ty": {} }`. [Docs](https://docs.astral.sh/ty/installation/).

```sh
uv tool install ty@latest
```

#### typescript

TypeScript and JavaScript, using the project's own TypeScript (`npm install --save-dev typescript`). TypeScript 7 and later include the language server. Older versions need typescript-language-server. [Docs](https://github.com/typescript-language-server/typescript-language-server#installing).

```sh
npm install -g typescript-language-server typescript@6
```

# References

[Bun Docs](https://bun.sh/docs)

[LSP Specification](https://microsoft.github.io/language-server-protocol/)

[OpenCode Docs](https://opencode.ai/docs/)

[OpenCode LSP Docs](https://opencode.ai/docs/lsp/)

[OpenCode Plugins Docs](https://opencode.ai/docs/plugins/)

[OpenTUI Docs](https://github.com/sst/opentui)

[Oxc Docs](https://oxc.rs/docs/guide/introduction.html)

[SolidJS Docs](https://docs.solidjs.com/)
