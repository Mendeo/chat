import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat(
{
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all
});

export default [...compat.extends("eslint:recommended"),
{
	languageOptions:
	{
		globals:
		{
			...globals.browser,
			...globals.commonjs,
			...globals.node,
			...globals.mocha,
		},

		ecmaVersion: 12,
		sourceType: "module",
	},

	rules:
	{
		indent: ["error", "tab"],
		quotes: ["error", "single"],
		semi: ["error", "always"],
		"object-curly-spacing": ["error", "always"],
		"array-bracket-spacing": ["error", "never"],
		curly: ["error", "multi-line"],

		"brace-style": ["error", "allman",
		{
			allowSingleLine: true,
		}],

		"no-trailing-spaces": "error",
		"space-unary-ops": "error",
		"no-spaced-func": "error",
		"space-in-parens": ["error", "never"],

		"comma-spacing": ["error",
		{
			before: false,
			after: true,
		}],

		"no-multi-str": "error",

		"no-multiple-empty-lines": ["error",
		{
			max: 1,
			maxEOF: 1,
			maxBOF: 0,
		}],

		"space-infix-ops": "error",

		"key-spacing": ["error",
		{
			beforeColon: false,
			mode: "minimum",
		}],

		"no-inner-declarations": "off",

		"no-constant-condition": ["error",
		{
			checkLoops: false,
		}],
	},
}];