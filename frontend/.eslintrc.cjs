module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: ['eslint:recommended'],
  plugins: ['react'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    // Without this, no-unused-vars can't see that a component imported for
    // JSX use (e.g. `import { Link } from ...`, used as `<Link>`) is used,
    // and flags dozens of actually-used imports as unused across the app.
    'react/jsx-uses-vars': 'warn',
  },
};
