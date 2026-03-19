# InstantDB Setup Guide

This app now supports frontend-direct InstantDB for user portfolios.

## 1) Create the InstantDB App

1. Go to [InstantDB](https://www.instantdb.com/).
2. Create a new app.
3. Copy the app ID from the dashboard.
4. Add it to your local env:

```bash
VITE_INSTANTDB_APP_ID=your_app_id
```

If you have not initialized CLI files yet, run:

```bash
npx instant-cli@latest init
```

This project now includes `instant.schema.ts` and `instant.perms.ts` at the repo root.

## 2) Enable Authentication

Use InstantDB auth from the dashboard:

- Enable **Magic Code** auth for fastest local setup.
- Optionally add OAuth providers later.

The frontend login flow uses:

- `db.auth.sendMagicCode({ email })`
- `db.auth.signInWithMagicCode({ email, code })`

## 3) Data Model to Create

Use these namespaces (entities):

### `users`

- `email` (string)
- `name` (string)
- `tier` (string, optional)
- `avatarUrl` (string, optional)
- `createdAt` (number, unix ms)
- `updatedAt` (number, unix ms)

### `portfolios`

- `userId` (string)
- `name` (string)
- `baseCurrency` (string; default `USD`)
- `cashReserve` (number)
- `strategyGrowthPct` (number)
- `strategyFixedPct` (number)
- `createdAt` (number, unix ms)
- `updatedAt` (number, unix ms)

### `positions`

- `portfolioId` (string)
- `symbol` (string)
- `name` (string)
- `sector` (string)
- `shares` (number)
- `avgCost` (number)
- `updatedPrice` (number)
- `analysisTag` (string, optional)
- `analysisText` (string, optional)
- `updatedAt` (number, unix ms)

### `portfolio_events`

- `portfolioId` (string)
- `eventType` (string; `BUY`, `SELL`, `CASH_ADJUSTMENT`)
- `symbol` (string, optional)
- `asset` (string, optional)
- `shares` (number, optional)
- `price` (number, optional)
- `amount` (number)
- `status` (string; default `Completed`)
- `eventAt` (number, unix ms)

After reviewing your model, push schema changes:

```bash
npx instant-cli@latest push schema
```

## 4) Permissions on InstantDB Website

Create rules so a signed-in user can only access their own portfolio records.

Recommended rule intent:

- A user can read/write `portfolios` where `portfolio.userId == auth.user.id`.
- A user can read/write `positions` where the position belongs to one of their portfolios.
- A user can read/write `portfolio_events` where the event belongs to one of their portfolios.
- A user can read/write their own `users` profile row by `userId/auth.id`.

Keep all cross-user reads denied.

The repo includes a starting `instant.perms.ts` ruleset with owner-based access.
Push permission changes with:

```bash
npx instant-cli@latest push perms
```

## 5) Seed Data (Optional)

For faster verification:

1. Create one test user by signing in once via magic code.
2. Let the app auto-bootstrap a default portfolio and seed positions.
3. Confirm dashboard totals and strategy split load after refresh.

## 6) Phase 2 Hybrid Snapshot Preparation

When you are ready for persisted metrics, add these fields on `portfolios`:

- `snapshotTotalValue`
- `snapshotInvestedAmount`
- `snapshotAt`

These remain optional in phase 1; phase 1 computes totals from positions + cash.
