import eslintJest from 'super-configs/eslint/jest';
import eslintTs from 'super-configs/eslint/ts';

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  ...eslintTs,
  ...eslintJest,
  {
    files: ['src/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
