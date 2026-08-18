import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
  globalIgnores([
    'node_modules',
    'main.js',
    'esbuild.config.mjs',
    'package.json',
    'package-lock.json',
    'manifest.json',
    'versions.json',
  ]),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...obsidianmd.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      'obsidianmd/ui/sentence-case': [
        'warn',
        {
          brands: ['WeChat', 'WeChat Workbench', 'AppSecret', 'AppID'],
          acronyms: ['API'],
          enforceCamelCaseLower: true,
        },
      ],
    },
  },
  {
    files: ['src/settings/settings-tab.ts'],
    rules: {
      // The imperative API is required because the product supports Obsidian 1.11.4.
      'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
      '@typescript-eslint/no-deprecated': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'obsidianmd/prefer-create-el': 'off',
      'obsidianmd/ui/sentence-case': 'off',
      'obsidianmd/no-global-this': 'off',
    },
  },
);
