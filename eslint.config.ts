import { fixupPluginRules } from "@eslint/compat";
import importPlugin from "eslint-plugin-import";
// @ts-expect-error - no types available
import neverthrowPlugin from "eslint-plugin-neverthrow";
import perfectionistPlugin from "eslint-plugin-perfectionist";
import prettierPlugin from "eslint-plugin-prettier/recommended";
// @ts-expect-error - no types available
import promisePlugin from "eslint-plugin-promise";
// @ts-expect-error - no types available
import securityPlugin from "eslint-plugin-security";
import unicornPlugin from "eslint-plugin-unicorn";
import { defineConfig } from "eslint/config";
import tseslintPlugin from "typescript-eslint";

export default defineConfig([
	{
		ignores: [
			"**/*.d.ts",
			"dist",
			"node_modules",
			"src/shared/api/dit",
			"prettier.config.js",
			"src/database/schemas/auth.ts",
			"src/OpenAPI.ts",
		],
	},
	{ files: ["**/*.{ts}"] },
	// eslint-disable-next-line import/no-named-as-default-member
	tseslintPlugin.configs.all,
	perfectionistPlugin.configs["recommended-natural"],
	importPlugin.flatConfigs.recommended,
	importPlugin.flatConfigs.typescript,
	unicornPlugin.configs.all,
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	securityPlugin.configs.recommended,
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	promisePlugin.configs["flat/recommended"],
	{
		plugins: {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			neverthrow: fixupPluginRules(neverthrowPlugin),
		},
	},
	{
		rules: {
			"@typescript-eslint/consistent-return": "off",
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/naming-convention": "off",
			"@typescript-eslint/no-magic-numbers": "off",
			"@typescript-eslint/prefer-readonly-parameter-types": "warn",
			"@typescript-eslint/restrict-template-expressions": [
				"error",
				{
					allowNumber: true,
				},
			],
			"import/no-unresolved": ["error", { ignore: ["^/", "^bun:"] }],
			"unicorn/filename-case": "off",
			"unicorn/no-array-callback-reference": "off",
			"unicorn/no-keyword-prefix": "off",
			"unicorn/no-null": "off",
			"unicorn/no-useless-undefined": "off",
			"unicorn/prefer-at": ["error", { checkAllIndexAccess: true }],
			"unicorn/prefer-ternary": "off",
			"unicorn/prevent-abbreviations": "off",
		},
		settings: {
			"import/resolver": {
				typescript: {
					alwaysTryTypes: true,
					project: "./tsconfig.json",
				},
			},
		},
	},
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
			},
		},
	},
	prettierPlugin,
]);
