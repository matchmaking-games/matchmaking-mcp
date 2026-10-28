import tseslint from 'typescript-eslint'

export default tseslint.config({
  files: ['**/*.ts'],
  extends: [tseslint.configs.recommended],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    // Prefixo _ para variáveis intencionalmente não usadas
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
})
