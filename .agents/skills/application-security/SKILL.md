---
name: application-security
description: Review and improve web application security, secrets handling, authentication, authorization, and trust boundaries.
metadata:
  domain: security
  triggers: secrets, login, permissions, user input, privacy
  prerequisites: the code path that handles the data
  outputs: findings with evidence and a safe fix
  priority: task
---

# Application Security

Treat security as part of design and implementation, not a final cosmetic pass.

## Threat-model workflow
1. Identify sensitive data, assets, actors, trust boundaries, and entry points.
2. Consider likely abuse cases and business impact.
3. Prioritize controls by risk.
4. Implement least-privilege controls.
5. Verify with tests and safe, authorized checks.
6. Document residual risks.

## Review areas
- Authentication and session/token handling.
- Server-side object and function authorization.
- SQL injection and unsafe query construction.
- XSS and unsafe rendering.
- CSRF where relevant.
- CORS configuration.
- SSRF for user-controlled outbound requests.
- File uploads and unsafe deserialization.
- Rate limiting and resource exhaustion.
- Dependency vulnerabilities.
- Secret exposure in repositories, logs, client bundles, and CI.
- Security headers and TLS.
- Multi-tenant data isolation.
- Error messages and audit logging.

## Non-negotiable controls
- Never commit real secrets.
- Never rely on frontend-only authorization.
- Validate untrusted data at server boundaries.
- Use parameterized queries or safe ORM APIs.
- Apply least privilege to accounts, API tokens, and database users.
- Avoid logging credentials, session cookies, access tokens, or unnecessary personal data.
- Use secure session settings appropriate to the deployment.
- Do not disable TLS verification or security protections as a routine workaround.
- Obtain explicit authorization before intrusive security testing or production changes.

## Cloudflare boundary
WAF, DDoS protection, and edge controls complement—but do not replace—application authorization, secure database access, input validation, or secure origin configuration.

Report each issue with severity, evidence, impact, recommended fix, and verification steps.
