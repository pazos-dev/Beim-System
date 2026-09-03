import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['out/**', 'node_modules/**', 'dist/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Ban @beim/data and @prisma/client in renderer files only
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@beim/data',
              message:
                'Renderer must not import @beim/data. Use the IPC bridge (window.beim) instead.',
            },
            {
              name: '@prisma/client',
              message: 'Renderer must not import @prisma/client. DB lives only in main process.',
            },
          ],
        },
      ],
    },
  },
);
