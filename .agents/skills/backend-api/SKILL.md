---
name: backend-api
description: Use when designing or changing an API, server routes, middleware, request validation or business logic, in any backend stack.
metadata:
  domain: backend
  triggers: API routes, server logic, request validation
  prerequisites: an API layer in the project
  outputs: an endpoint design or change with tests
  priority: task
---

# Backend API Engineering

## Read first
Use when: designing or changing an API, routes, middleware, validation or business logic, in any backend stack.
Not when: no server or API layer; schema work alone (database-engineering).
Must do: find the stack from its manifest and follow its framework; validate input at the boundary; authorize on the server; test success, invalid input, auth failure and missing resource.
Done when: the targeted API tests ran and their result is reported, with error shapes defined.
Stop here if: the user only wants an endpoint contract (methods, shapes, status codes).
Read on only for: "Implementation rules" before handlers; "Reliability" for calls out.
Next: `database-engineering` if tables change.

## Framework choice
Find the stack first from its manifest (`package.json`, `pyproject.toml` or `requirements.txt`, `go.mod`, `pom.xml` or `build.gradle`, `Gemfile`, `composer.json`, `*.csproj`) and follow the framework the project already uses. Do not switch frameworks unless a migration is justified (`stack-migration` workflow).
For a new service, pick by fit, not habit: a small, widely used option for a small API, a batteries-included one when an ORM, auth and admin are needed. Examples: Node.js (Express, Fastify, NestJS), Python (FastAPI, Django, Flask), Go (net/http, chi), Java (Spring Boot), Ruby (Rails), PHP (Laravel), .NET (ASP.NET Core).

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
Inspect the manifest, dependencies and route conventions first; name the stack you found. Run the targeted API tests and relevant lint/type checks; report exactly what ran.
