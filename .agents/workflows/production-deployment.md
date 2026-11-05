# Workflow: Production Deployment

## Guardrails
Explain impact and obtain explicit confirmation before destructive or production-affecting actions. Do not expose secrets or claim deployment success without verification.

## Steps
1. Confirm target environment, release scope, owner approval, and rollback method.
2. Inspect runtime versions, dependencies, environment configuration, DNS/TLS, database connectivity, and current health.
3. Run tests, linting, type checks, and production build checks that apply.
4. Review migrations, backward compatibility, backup/recovery, and secret configuration.
5. Deploy to preview/staging where available.
6. Verify deployed frontend, API, database operations, authentication, and critical user journeys.
7. Check DNS, TLS, cache behavior, security rules, logs, and error rates as relevant.
8. Promote to production only when release criteria pass.
9. Verify externally from the deployed environment; a successful build or deploy command alone is insufficient.
10. Document release version, checks, known limitations, and rollback steps.

## Cloudflare-specific checks
- DNS records and proxy status are correct.
- Browser-to-edge and edge-to-origin TLS are valid.
- Cache rules do not expose personalized data.
- Worker/runtime compatibility and bindings are correct where used.
- WAF/rate-limit rules do not unintentionally block legitimate traffic.
- Origin connectivity and logs are available for diagnosis.
