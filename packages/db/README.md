# @wellnessnearme/db

Prisma schema v1 for `findwellnessnearme.org`.

## Files

- `prisma/schema.prisma`: database schema (PostgreSQL)

## Typical workflow

From repo root:

```bash
npm install
```

Set Neon connection strings in `packages/db/.env`:

```bash
# Pooled URL (Neon pooler) for runtime
DATABASE_URL="postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/DBNAME?sslmode=require"

# Direct URL (no pooler) for migrations/introspection
DIRECT_URL="postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/DBNAME?sslmode=require"
```

Validate/format:

```bash
npm run -w @wellnessnearme/db prisma:validate
npm run -w @wellnessnearme/db prisma:format
```

Create the first migration (dev):

```bash
npm run -w @wellnessnearme/db prisma:migrate:dev
```


