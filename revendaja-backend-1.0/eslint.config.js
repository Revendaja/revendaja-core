const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'generated/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Arquivos de configuração na raiz (CommonJS puro, sem tipos).
    files: ['*.config.js', '*.config.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Regras type-aware exigem que o arquivo faça parte do projeto TS
    // referenciado (tsconfig.json inclui apenas "src" e "test"), então esse
    // bloco só se aplica a esses arquivos — configs na raiz (eslint.config.js,
    // jest.config.js, prisma.config.ts etc.) usam apenas as regras não
    // type-aware herdadas dos blocos acima.
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  prettier,
);
