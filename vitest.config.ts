import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		// Works both from the repo root (`npm test`) and from a package directory
		// (`npm test --workspace <name>`), where cwd is the package folder.
		include: ["packages/*/tests/**/*.test.ts", "tests/**/*.test.ts"],
	},
});
