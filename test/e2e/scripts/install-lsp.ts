import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { E2E_DIRECTORY } from "../environment.ts";

interface InstallStep {
  label: string;
  requiredCommands: string[];
  binaryName?: string;
  install: () => Promise<void>;
}

interface CommandOptions {
  workingDirectory?: string;
  environment?: Record<string, string>;
}

const IS_UPDATE_REQUESTED = process.argv.includes("--update");

const BIN_DIRECTORY = path.join(E2E_DIRECTORY, "bin");
const CACHE_DIRECTORY = path.join(E2E_DIRECTORY, "cache");
const GO_PATH_DIRECTORY = path.join(E2E_DIRECTORY, "go");
const LEGACY_NODE_DIRECTORY = path.join(E2E_DIRECTORY, "legacy");
const VIRTUAL_ENVIRONMENT_DIRECTORY = path.join(E2E_DIRECTORY, "venv");

const CACHE_ENVIRONMENT = {
  npm_config_cache: path.join(CACHE_DIRECTORY, "npm"),
  UV_CACHE_DIR: path.join(CACHE_DIRECTORY, "uv"),
  GOCACHE: path.join(CACHE_DIRECTORY, "go-build"),
};

const RELEASE_PLATFORM = process.platform;
const RELEASE_ARCHITECTURE = process.arch === "arm64" ? "arm64" : "amd64";
const CLOJURE_LSP_RELEASE_PLATFORM = process.platform === "darwin" ? "macos" : "linux";
const CLOJURE_LSP_RELEASE_ARCHITECTURE = process.arch === "arm64" ? "aarch64" : "amd64";

const CLOJURE_LSP_RELEASE_URL = `https://github.com/clojure-lsp/clojure-lsp/releases/latest/download/clojure-lsp-native-${CLOJURE_LSP_RELEASE_PLATFORM}-${CLOJURE_LSP_RELEASE_ARCHITECTURE}.zip`;
const TERRAFORM_LS_RELEASE_LOOKUP_URL = "https://api.releases.hashicorp.com/v1/releases/terraform-ls/latest";
const TFLINT_RELEASE_URL = `https://github.com/terraform-linters/tflint/releases/latest/download/tflint_${RELEASE_PLATFORM}_${RELEASE_ARCHITECTURE}.zip`;

const NODE_PACKAGE_VERSIONS = {
  "typescript-language-server": "^5",
  "vscode-langservers-extracted": "^4",
  "@ansible/ansible-language-server": "^1",
  pyright: "^1",
  typescript: "^7",
  eslint: "^9",
  oxlint: "^1",
};
const LEGACY_NODE_PACKAGE_VERSIONS = { typescript: "^5" };
const PYTHON_PACKAGES = ["ty", "ruff", "ansible-core", "ansible-lint"];

const INSTALL_STEPS: InstallStep[] = [
  {
    label: "node servers",
    requiredCommands: ["npm"],
    install: () => installNodePackages(E2E_DIRECTORY, NODE_PACKAGE_VERSIONS),
  },
  {
    label: "typescript 5",
    requiredCommands: ["npm"],
    install: () => installNodePackages(LEGACY_NODE_DIRECTORY, LEGACY_NODE_PACKAGE_VERSIONS),
  },
  {
    label: "python servers",
    requiredCommands: ["uv"],
    install: installPythonPackages,
  },
  {
    label: "gopls",
    requiredCommands: ["go"],
    binaryName: "gopls",
    install: installGopls,
  },
  {
    label: "terraform-ls",
    requiredCommands: ["unzip"],
    binaryName: "terraform-ls",
    install: async () => installZipRelease(await findTerraformLsReleaseUrl(), "terraform-ls"),
  },
  {
    label: "tflint",
    requiredCommands: ["unzip"],
    binaryName: "tflint",
    install: () => installZipRelease(TFLINT_RELEASE_URL, "tflint"),
  },
  {
    label: "clojure-lsp",
    requiredCommands: ["unzip"],
    binaryName: "clojure-lsp",
    install: () => installZipRelease(CLOJURE_LSP_RELEASE_URL, "clojure-lsp"),
  },
];

await mkdir(BIN_DIRECTORY, { recursive: true });
for (const installStep of INSTALL_STEPS) {
  await runInstallStep(installStep);
}
console.log("skip     rust-analyzer and clippy (install with `rustup component add rust-analyzer clippy`)");

async function runInstallStep(installStep: InstallStep): Promise<void> {
  const missingCommands = installStep.requiredCommands.filter((command) => Bun.which(command) === null);
  if (missingCommands.length > 0) {
    console.log(`skip     ${installStep.label} (needs ${missingCommands.join(", ")})`);
    return;
  }
  if (installStep.binaryName && !IS_UPDATE_REQUESTED && existsSync(path.join(BIN_DIRECTORY, installStep.binaryName))) {
    console.log(`skip     ${installStep.label} (already installed, pass --update to reinstall)`);
    return;
  }

  try {
    await installStep.install();
    console.log(`ok       ${installStep.label}`);
  } catch (error) {
    console.log(`failed   ${installStep.label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runCommand(command: string[], commandOptions: CommandOptions = {}): Promise<void> {
  const commandProcess = Bun.spawn(command, {
    cwd: commandOptions.workingDirectory,
    env: { ...process.env, ...CACHE_ENVIRONMENT, ...commandOptions.environment },
    stdout: "ignore",
  });
  if ((await commandProcess.exited) !== 0) {
    throw new Error(`${command.join(" ")} failed`);
  }
}

async function installGopls(): Promise<void> {
  // Newer Go toolchains that gopls needs are downloaded into GOMODCACHE, so that stays inside '.e2e/' too.
  await runCommand(["go", "install", "golang.org/x/tools/gopls@latest"], {
    environment: {
      GOPATH: GO_PATH_DIRECTORY,
      GOMODCACHE: path.join(GO_PATH_DIRECTORY, "mod"),
      GOBIN: BIN_DIRECTORY,
      GOFLAGS: "-modcacherw",
    },
  });
}

async function installNodePackages(packageDirectory: string, packageVersions: Record<string, string>): Promise<void> {
  const packageJson = { private: true, dependencies: packageVersions };
  await mkdir(packageDirectory, { recursive: true });
  await Bun.write(path.join(packageDirectory, "package.json"), JSON.stringify(packageJson, null, 2));
  await runCommand(["npm", "install", "--no-audit", "--no-fund", "--loglevel=error"], {
    workingDirectory: packageDirectory,
  });
}

async function installPythonPackages(): Promise<void> {
  const pythonExecutable = path.join(VIRTUAL_ENVIRONMENT_DIRECTORY, "bin", "python");
  await runCommand(["uv", "venv", "--quiet", "--allow-existing", VIRTUAL_ENVIRONMENT_DIRECTORY]);
  await runCommand(["uv", "pip", "install", "--quiet", "--python", pythonExecutable, ...PYTHON_PACKAGES]);
}

async function findTerraformLsReleaseUrl(): Promise<string> {
  const releaseResponse = await fetch(TERRAFORM_LS_RELEASE_LOOKUP_URL);
  if (!releaseResponse.ok) {
    throw new Error(`terraform-ls release lookup returned ${releaseResponse.status}`);
  }

  const latestRelease = (await releaseResponse.json()) as { builds: { os: string; arch: string; url: string }[] };
  const platformBuild = latestRelease.builds.find(
    (build) => build.os === RELEASE_PLATFORM && build.arch === RELEASE_ARCHITECTURE,
  );
  if (!platformBuild) {
    throw new Error(`no terraform-ls build for ${RELEASE_PLATFORM}/${RELEASE_ARCHITECTURE}`);
  }
  return platformBuild.url;
}

async function installZipRelease(releaseUrl: string, binaryName: string): Promise<void> {
  const releaseResponse = await fetch(releaseUrl);
  if (!releaseResponse.ok) {
    throw new Error(`${releaseUrl} returned ${releaseResponse.status}`);
  }

  const zipFile = path.join(BIN_DIRECTORY, `${binaryName}.zip`);
  await Bun.write(zipFile, releaseResponse);
  await runCommand(["unzip", "-o", "-q", zipFile, "-d", BIN_DIRECTORY]);
  await rm(zipFile);
}
