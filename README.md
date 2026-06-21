# NeuroCrop React frontend

React 19 + Vite + TypeScript migration of the NeuroCrop dashboard.

## Development

```bash
pnpm install
pnpm dev
```

## Checks

```bash
pnpm lint
pnpm build
```

Vite writes the production website to `dist/`. Upload the complete contents of
`dist/` to the domain's `public_html` directory. Do not upload `src/` or
`node_modules/`.

## Backend connection

Edit `public/runtime-config.js` during development or `dist/runtime-config.js`
after a build:

```js
window.NEUROCROP_CONFIG = {
  apiBaseUrl: "https://api.example.lt/api/v1"
};
```

When the URL is empty, the frontend uses local mock data. Backend credentials,
database passwords, and ChirpStack keys must never be stored in this project.
