import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', '.expo/**'],
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
  {
    // CommonJS developer-config files run under Node, not the RN bundle.
    files: ['metro.config.js', 'index.js'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@beim/data',
              message:
                'Mobile source must not import @beim/data. Use the CatalogDataSource adapter instead.',
            },
            {
              name: '@prisma/client',
              message:
                'Mobile source must not import @prisma/client. DB stays server-side.',
            },
            {
              name: '@beim/domain',
              message:
                'Mobile source must not import @beim/domain. Domain logic stays server-side.',
            },
          ],
        },
      ],
    },
  },
);
