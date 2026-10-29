# Flightboard

Flightboard is a small demo app for IT field service work.
A buyer creates work orders, publishes or routes them to providers, and tracks each one to payment.
The app is a toy. It keeps data in memory and has no login.

## Screens

- **Flightboard**: all work orders in a dense table, with status tabs, health chips, and a summary panel.
- **New Work Order**: a form with Basics, Schedule, Location, Pay, and Tasks sections. You can save a draft or publish.
- **Work order detail**: status, provider, pay breakdown, and tasks grouped Prep / On Site / Post.

## Parts

| Folder | What it does | Stack |
|---|---|---|
| `web/` | The user interface | React 18, TypeScript, MUI v5, Vite |
| `api/` | Work orders, tasks, and providers over REST | Go 1.25, standard library only |
| `pay/` | Computes pay for Fixed, Hourly, and Per Device work | PHP 8.3, no framework |

The web calls both services through the Vite dev proxy: `/api` goes to the API and `/pay` goes to the pay service.
The API loads `api/internal/store/seed.json` at start. A restart resets all data.

## Run it locally

You need Go 1.25, Node 24 or later, and either PHP 8.3 with Composer or Docker.

```sh
make setup   # npm ci, composer install, go mod download
make dev     # starts api :8781, pay :8782, web :5781
```

Open http://localhost:5781.
Press Ctrl-C to stop all three parts.
If PHP is not installed, `make` and `scripts/dev.sh` run PHP and Composer in Docker.

To start one part at a time:

```sh
cd api && go run ./cmd/flightboard-api
cd pay && php -S 127.0.0.1:8782 public/index.php
cd web && npm run dev
```

## Test

```sh
make test    # go test, phpunit, vitest
make lint    # gofmt, go vet, eslint, tsc
```

CI runs the same checks in three jobs: `web`, `api`, and `pay`.

## For coding agents

Read [AGENTS.md](AGENTS.md). It lists the commands, the file map, and the commit rules.
