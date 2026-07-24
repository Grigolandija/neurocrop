# NeuroCrop staging and deployment

CI runs frontend lint/tests/build, backend tests, migrations, a live two-tenant isolation test, and a Docker build.

## GitHub environments

Create `staging` and `production` environments. Require manual approval for `production` and add:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_PRIVATE_KEY`

The release workflow publishes immutable images named with the Git commit SHA. It never deploys `latest`.
Make the repository GHCR package readable by the VPS (public package or a persistent read-only `docker login` on the server).

Production runs `neurocrop-api` and `neurocrop-ingest` from the same immutable
backend image. Compose disables the API HTTP healthcheck for the ingest command,
and deployment succeeds only when the API is healthy and ingest is running.

The GitHub Actions SSH key must be installed with a forced command:

```text
command="/opt/neurocrop-deploy/github-actions-deploy.sh",restrict ssh-ed25519 ... neurocrop-github-actions-production
```

The forced command accepts only `staging:<40-hex-sha>` or
`production:<40-hex-sha>` and constructs the immutable GHCR image names itself.
The key cannot open a shell or upload deployment scripts.

## Server setup

Copy each compose file once:

```text
/opt/neurocrop-deploy/staging/compose.yml
/opt/neurocrop-deploy/production/compose.yml
```

Create a mode `600` `runtime.env` in each directory with PostgreSQL credentials. Staging must use `PGDATABASE=neurocrop_staging`; production uses `PGDATABASE=neurocrop`.

Create the staging database once, then let the API execute versioned migrations. Do not point staging at the production database.

Staging runs two isolated containers:

- `neurocrop-frontend-staging`, serving the immutable frontend image;
- `neurocrop-api-staging`, using only `neurocrop_staging`.

The temporary protected staging URL is `https://staging.194-135-91-65.nip.io`. Caddy serves the frontend and proxies `/api/*` to the staging API, so session cookies remain same-origin. Replace this temporary hostname with `staging.neurocrop.lt` when Cloudflare DNS and access policy are ready.

The VPS checks GitHub every five minutes and deploys only the newest `main` commit whose `CI` workflow completed successfully. Images are tagged with the full commit SHA, and the immediately preceding pair remains available through `rollback.sh staging`.

## Rollback

Every successful deployment records the prior immutable image. Roll back with:

```bash
/opt/neurocrop-deploy/rollback.sh staging
/opt/neurocrop-deploy/rollback.sh production
```
