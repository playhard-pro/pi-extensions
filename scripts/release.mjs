#!/usr/bin/env node
/**
 * Release helper for the pi-extensions monorepo.
 *
 * Bumps a workspace version, commits it, and creates a `<package-dir>@<version>`
 * tag. Pushing that tag triggers `.github/workflows/release.yml`, which runs the
 * test suite and publishes the package to npm with provenance.
 *
 * Usage:
 *   node scripts/release.mjs <package-dir> <bump> [options]
 *
 * Arguments:
 *   package-dir   Directory name under packages/ (e.g. pi-deepseek-balance)
 *   bump          patch | minor | major | prepatch | preminor | premajor | prerelease
 *                 or an explicit semver version (e.g. 1.2.3)
 *
 * Options:
 *   --preid <id>  Prerelease identifier (e.g. beta) used with prerelease bumps
 *   --push        Push the commit and tag to origin (triggers the release workflow)
 *   --dry-run     Print the commands without changing anything
 *   -h, --help    Show this help
 *
 * Examples:
 *   node scripts/release.mjs pi-deepseek-balance patch
 *   node scripts/release.mjs pi-deepseek-balance minor --push
 *   node scripts/release.mjs pi-deepseek-balance prerelease --preid beta --push
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @param {string[]} args */
function parseArgs(args) {
	return {
		push: args.includes("--push"),
		dryRun: args.includes("--dry-run"),
		help: args.includes("--help") || args.includes("-h"),
		preid: readOption(args, "--preid"),
		positionals: args.filter((arg) => !arg.startsWith("-") && !isOptionValue(args, arg)),
	};
}

/** @param {string[]} args @param {string} name */
function readOption(args, name) {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === name) return args[i + 1];
		if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
	}
	return undefined;
}

/**
 * Exclude values that belong to `--preid <value>` / `--preid=<value>` from
 * positionals.
 *
 * @param {string[]} args
 * @param {string} value
 */
function isOptionValue(args, value) {
	const index = args.indexOf(value);
	return index > 0 && args[index - 1] === "--preid";
}

const USAGE = `Usage: node scripts/release.mjs <package-dir> <bump> [options]

Arguments:
  package-dir   Directory name under packages/ (e.g. pi-deepseek-balance)
  bump          patch | minor | major | prepatch | preminor | premajor | prerelease
                or an explicit semver version (e.g. 1.2.3)

Options:
  --preid <id>  Prerelease identifier (e.g. beta) used with prerelease bumps
  --push        Push the commit and tag to origin (triggers the release workflow)
  --dry-run     Print the commands without changing anything
  -h, --help    Show this help`;

const options = parseArgs(process.argv.slice(2));

if (options.help) {
	console.log(USAGE);
	process.exit(0);
}

const [packageDir, bump] = options.positionals;

if (!packageDir || !bump) {
	console.error(USAGE);
	process.exit(1);
}

const manifestPath = join(repoRoot, "packages", packageDir, "package.json");

if (!existsSync(manifestPath)) {
	console.error(`✗ No package found at packages/${packageDir}`);
	process.exit(1);
}

/** @param {string} path */
function readManifest(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

const manifest = readManifest(manifestPath);

if (manifest.private === true) {
	console.error(`✗ ${manifest.name} is marked private and cannot be published`);
	process.exit(1);
}

const { name } = manifest;

/**
 * @param {string} command
 * @param {string[]} args
 */
function run(command, args) {
	console.log(`$ ${command} ${args.join(" ")}`);
	if (options.dryRun) return;
	execFileSync(command, args, { cwd: repoRoot, stdio: "inherit" });
}

console.log(`Releasing ${name} (packages/${packageDir}) — ${options.dryRun ? "dry run" : "live"}\n`);

// 1. Bump the workspace version (updates package.json and the root lockfile).
const versionArgs = ["version", bump, "--workspace", name, "--no-git-tag-version"];
if (options.preid) versionArgs.push("--preid", options.preid);
run("npm", versionArgs);

const version = options.dryRun ? "<new-version>" : readManifest(manifestPath).version;
const tag = `${packageDir}@${version}`;

// 2. Commit the bump and create the release tag.
run("git", ["add", `packages/${packageDir}/package.json`, "package-lock.json"]);
run("git", ["commit", "-m", `release(${name}): v${version}`]);
run("git", ["tag", tag]);

// 3. Optionally push, which triggers the publish workflow.
if (options.push) {
	run("git", ["push"]);
	run("git", ["push", "origin", tag]);
}

console.log(`\n✓ Prepared ${name}@${version} (tag: ${tag})`);
console.log(
	options.push
		? "Pushed — GitHub Actions will publish it to npm."
		: `Next: git push && git push origin ${tag}`,
);
