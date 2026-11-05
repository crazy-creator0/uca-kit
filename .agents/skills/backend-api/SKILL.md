---
name: backend-api
description: Design and implement Python APIs, business logic, authentication boundaries, and reliable HTTP behavior.
metadata:
  domain: backend
  triggers: API routes, server logic, request validation
  prerequisites: an API layer in the project
  outputs: an endpoint design or change with tests
  priority: task
---

# Backend API Engineering

## Framework choice
Choose FastAPI for suitable API-centric services; choose Django when integrated ORM, authentication, admin, and application conventions fit. Use Flask only where its minimalism is beneficial. Follow the existing project unless a migration is justified.

## Request lifecycle
Trace actual layers:
HTTP request → router → middleware → authentication → authorization → validation → business logic → persistence → response serialization.
Do not invent layers that the project does not use.

## Implementation rules
- Define API contracts, methods, status codes, request/response shapes, and error behavior.
- Validate untrusted inputs at the boundary.
- Separate business rules from transport concerns when this improves clarity.
- Enforce authorization server-side for every protected resource.
- Bind query parameters; never build SQL by string concatenation (`application-security` owns the full rule).
- Use pagination and limits for potentially large collections.
- Handle timeouts, upstream failures, and database errors intentionally.
- Avoid returning stack traces, secrets, or internal implementation details to clients.
- Make retry behavior safe; use idempotency where repeated writes are possible.
- Keep configuration and secrets out of source control.
- Add tests for success, invalid input, auth failures, missing resources, and dependency errors.

## Reliability
Use structured logs with request/correlation IDs when available. Set explicit timeouts for external calls. Avoid broad exception catches that hide failures. Return stable, documented error shapes without leaking internals.

## Verification
Inspect project dependencies and route conventions first. Run the targeted API tests and relevant lint/type checks; report exactly what ran.
