import tseslint from 'typescript-eslint'

export default tseslint.config({
  files: ['src/**/*.ts'],
  extends: [tseslint.configs.recommended],
  rules: {
    // Colunas inexistentes no banco causam erro de tipo em vez de runtime
    '@typescript-eslint/no-explicit-any': 'error',
    // Prefixo _ para variáveis intencionalmente não usadas
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    // Tools ainda não implementadas exportam apenas tipos — permitido
    '@typescript-eslint/no-empty-object-type': 'off',
  },
})
