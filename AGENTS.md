# AGENTS.md

This file tells coding agents how to build, run, and test Flightboard.
Read it before you change code.

## What this repo is

Flightboard is a small work order board for IT field service.
A buyer creates work orders, publishes or routes them to providers, and tracks them to payment.
The repo has three parts:

| Part | Stack | Port |
|---|---|---|
| `web/` | React 18, TypeScript, MUI v5, Vite, Vitest | 5781 |
| `api/` | Go 1.25, `net/http` router, in-memory store with a seed JSON file | 8781 |
| `pay/` | PHP 8.3, built-in web server, no framework, PHPUnit | 8782 |

The web calls the API at `/api` and the pay service at `/pay`.
The Vite dev server proxies both paths. The API does not call the pay service.

## Commands

Run each command from the repo root unless the line says otherwise.

| Task | Command |
|---|---|
| Install everything | `make setup` |
| Start all three parts | `make dev` (open http://localhost:5781) |
| All tests | `make test` |
| All linters | `make lint` |
| Web: lint, typecheck, test, build | `cd web && npm run lint && npm run typecheck && npm test && npm run build` |
| API: format check, vet, test | `cd api && gofmt -l . && go vet ./... && go test ./...` |
| Pay: install and test | `cd pay && composer install && vendor/bin/phpunit` |
| Pay without local PHP | `docker run --rm -v "$PWD/pay":/app -w /app php:8.3-cli vendor/bin/phpunit` |

CI runs three jobs: `web`, `api`, and `pay` (`.github/workflows/ci.yml`).
All three jobs must pass before a pull request can merge.

## Where things live

| To change | Edit |
|---|---|
| Statuses, sub-statuses, pay types, lifecycle rules | `api/internal/workorder/workorder.go` |
| Validation of new work orders | `ValidateNew` in `api/internal/workorder/workorder.go` |
| Storage, filters, check-in and check-out | `api/internal/store/store.go` |
| Seed data | `api/internal/store/seed.json` |
| REST routes and query parameters | `api/internal/httpapi/server.go` |
| Pay calculation per pay type | `pay/src/PayCalculator.php` |
| Pay HTTP routes | `pay/src/App.php` |
| TypeScript types for API and pay JSON | `web/src/api/types.ts` |
| Fetch calls | `web/src/api/client.ts` |
| Flightboard tabs and counts | `web/src/lib/tabs.ts` |
| Flightboard table columns | `web/src/pages/Flightboard/columns.tsx` |
| Status and health chip labels and colours | `web/src/lib/status.ts` |
| Pay text such as "$65.00 / hr (4)" | `web/src/lib/format.ts` |
| Work order detail page and pay breakdown | `web/src/pages/WorkOrderDetail/` |
| New Work Order form rules | `web/src/lib/workOrderForm.ts` |
| Theme colours and fonts | `web/src/theme.ts` |

A change to a status or a pay type usually touches the Go model, `web/src/api/types.ts`, and the web lib file that shows it.

## API summary

| Method and path | Purpose |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/work-orders?status=&providerId=&typeOfWork=` | List work orders, newest first, with `provider` expanded and `expenseTotals`; optional `status` filters by lifecycle status (e.g. `Draft` or `Work%20Done`), unknown statuses return 400; optional `typeOfWork` keeps one type of work, ignoring case |
| `GET /api/work-orders/export?status=&providerId=&typeOfWork=` | Download a CSV attachment, newest first, with columns `id`, `title`, `typeOfWork`, `status`, `subStatus`, `buyer`, `provider`, `city`, `state`, `scheduleStart`, `scheduleEnd`, `payType`, `payRate`, `health`, in that order. Uses the same optional `status`, `providerId` and `typeOfWork` filters as the list; unknown statuses return 400. Text cells that start with `=`, `+`, `-`, `@`, a tab or a carriage return get a leading `'`. |
| `POST /api/work-orders` | Create a work order as `Draft` or `Published` |
| `GET /api/work-orders/summary` | Total work orders, counts for every status, and `pendingExpenses`: the number of work orders with at least one `Pending` expense |
| `GET /api/work-orders/{id}` | One work order with `expenseTotals` |
| `GET /api/work-orders/week?start=&providerId=` | One week of scheduled work orders by day, from `start` (YYYY-MM-DD) for 7 days, with `total` and `unassigned` counts. Leaves out Cancelled and unscheduled work orders. |
| `GET /api/work-orders/{id}/progress` | Done and total task counts by group and overall, with a rounded-down completion percent |
| `GET /api/work-orders/{id}/nearby-providers` | Providers in the same state as the work order, highest score first, without the assigned provider, or an empty array |
| `GET /api/work-orders/{id}/expenses` | Work order expenses, newest first; an empty array if there are none |
| `POST /api/work-orders/{id}/expenses` | Add a `Pending` expense, body `{"category":"Parts","description":"...","amountCents":2400}`. Answers 201 with the expense, 400 for bad input, 404 for an unknown id, and 409 unless the work order is Assigned or Work Done. |
| `POST /api/work-orders/{id}/status` | Move to a new status, body `{"status":"Approved"}` |
| `POST /api/work-orders/{id}/check-in` | Record check-in, body `{"time":"<RFC 3339>"}` or `{}` for now |
| `POST /api/work-orders/{id}/check-out` | Record check-out, same body |
| `POST /api/work-orders/pay-run` | Mark approved work orders Paid in one step, body `{"ids":[9631821,9631822]}`. All or nothing: an unknown id answers 404, and a work order that is not Approved answers 409. Sets `paidAt`. |
| `PATCH /api/work-orders/{id}/tasks/{taskId}` | Mark a task done, body `{"done":true}` |
| `GET /api/providers`, `GET /api/providers/{id}` | Providers, highest score first |
| `POST /pay/quote` | Pay quote, body is a work order `pay` object |

`expenseTotals` has `count`, `pendingCents`, `approvedCents`, and `rejectedCents`.
The count includes all expenses; cents are summed by expense status. All fields are zero for a work order without expenses.

`paidAt` is the UTC time when a pay run marked the work order Paid. It is missing until then.

Errors use the shape `{"error":"message"}`.
The API returns 400 for bad input, 404 for an unknown id, and 409 for a change the lifecycle does not allow.
The pay service returns 422 for a pay type it cannot compute yet.

## Conventions

- Keep changes small. Change one behavior per pull request.
- Match the code around you. Do not refactor code outside the task.
- Add or update tests for every behavior change. Do not weaken an assertion to make a test pass.
- Web tests mock `web/src/api/client.ts` with `vi.mock`. Use `makeWorkOrder()` from `web/src/test/fixtures.ts`.
- Go tests use the standard `testing` package and `httptest`. Do not add test libraries.
- Use the domain words from the UI: work order, provider, buyer, Flightboard, Prep / On Site / Post.
- Do not add a dependency unless the task needs it. Say why in the pull request.

## Commits and pull requests

- Use Conventional Commits. Put the part in the scope.
  Examples: `feat(web): add At Risk tab`, `fix(api): reject unknown status`, `test(pay): cover hourly rounding`.
- Write the subject in the imperative mood. Keep it under 72 characters.
- Use the scopes `web`, `api`, `pay`, `ci`, or `docs`. Leave the scope out for a change that spans parts.

## Security

- Never commit secrets, tokens, keys, or `.env` files. This repo is public.
- Seed data uses invented names and companies. Do not add real personal data.
