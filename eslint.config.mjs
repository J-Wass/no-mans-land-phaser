import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '**/*.cjs',
      'eslint.config.mjs',
      'vite.config.ts',
    ],
  },
  {
    files: ['src/**/*.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        // Type-aware linting — required for no-floating-promises / no-misused-promises,
        // which catch un-awaited command dispatches and other async mistakes.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // High-value correctness rules (kept as errors):
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // The codebase pairs a very strict tsconfig with deliberate escape hatches;
      // tsc already covers unused vars (noUnusedLocals) and these would only add noise.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      // `interface X extends Y {}` aliases are used intentionally for saved-state types.
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  prettier,
);
