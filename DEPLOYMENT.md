# NeuroCrop staging and deployment

CI runs frontend lint/tests/build, backend tests, migrations, a live two-tenant isolation test, and a Docker build.

## GitHub environments

Create `staging` and `production` environments. Require manual approval for `production` and add:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_PRIVATE_KEY`

The release workflow publishes immutable images named with the Git commit SHA. It never deploys `latest`.
Make the repository GHCR package readable by the VPS (public package or a persistent read-only `docker login` on the server).

## Server setup

Copy each compose file once:

```text
/opt/neurocrop-deploy/staging/compose.yml
/opt/neurocrop-deploy/production/compose.yml
```

Create a mode `600` `runtime.env` in each directory with PostgreSQL credentials. Staging must use `PGDATABASE=neurocrop_staging`; production uses `PGDATABASE=neurocrop`.

Create the staging database once, then let the API execute versioned migrations. Do not point staging at the production database.

## Rollback

Every successful deployment records the prior immutable image. Roll back with:

```bash
/opt/neurocrop-deploy/rollback.sh staging
/opt/neurocrop-deploy/rollback.sh production
```
