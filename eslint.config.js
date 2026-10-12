import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Módulos de simulación: deben ser deterministas e independientes de la interfaz. */
const SIM_FILES = ['src/core/rng.ts', 'src/core/hash.ts', 'src/core/time.ts', 'src/world/**', 'src/entities/**', 'src/ai/**', 'src/sim/**', 'src/powers/brush.ts'];

export default tseslint.config(
  { ignores: ['dist', 'release', 'coverage', 'dev-dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: SIM_FILES,
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Usa Rng: la simulación debe ser determinista.' },
        { object: 'Math', property: 'sin', message: 'Evita funciones trascendentes en la simulación.' },
        { object: 'Math', property: 'cos', message: 'Evita funciones trascendentes en la simulación.' },
        { object: 'Math', property: 'pow', message: 'Evita Math.pow en la simulación.' },
        { object: 'Date', property: 'now', message: 'La simulación no puede depender del reloj real.' },
        { object: 'performance', property: 'now', message: 'La simulación no puede depender del reloj real.' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/render/*', '**/ui/*', '**/input/*', '**/game'], message: 'La simulación no puede depender de render/ui/input.' }] },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
);
