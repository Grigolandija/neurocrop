# Tenant isolation

Every customer-owned row is addressed through the organization stored in the authenticated database session. Client-provided organization IDs are not accepted as authorization context.

## Route contract

- Collection routes return only rows belonging to `req.user.organizationId`.
- Object routes verify both the resource identifier and `organization_id`.
- A foreign object identifier is hidden as `404`; a foreign collection filter returns an empty collection.
- Measurement reads first resolve a Section or Node inside the active organization, then query telemetry through the resulting DevEUI list.
- Platform routes are the only cross-organization routes and require platform-admin or super-admin middleware.

## Automated checks

Run the local contract and unit suite:

```sh
npm test
```

Run the live two-tenant test against staging fixtures that each contain at least one Area and Section:

```sh
TENANT_TEST_BASE_URL=https://staging-api.neurocrop.lt \
TENANT_A_EMAIL=tenant-a@example.com \
TENANT_A_PASSWORD='...' \
TENANT_B_EMAIL=tenant-b@example.com \
TENANT_B_PASSWORD='...' \
npm run test:tenant
```

The live test verifies dashboard discovery, filtered collections, readings, history, analytics, CSV export, profile mutation, Area/Section mutation, and Node sensor access across tenant boundaries.
