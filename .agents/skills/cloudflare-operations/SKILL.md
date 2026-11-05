---
name: cloudflare-operations
description: Diagnose and operate Cloudflare DNS, TLS, Workers, caching, security controls, and deployments using evidence.
metadata:
  domain: infrastructure
  triggers: Cloudflare DNS, TLS, Workers, caching
  prerequisites: a Cloudflare-managed project
  outputs: a diagnosis from evidence and a safe change plan
  priority: situational
---

# Cloudflare Operations

## Start with the actual architecture
Identify the domain, DNS records, proxy mode, TLS mode, origin, Worker/routes, cache rules, WAF/rate limits, bindings, and deployment method that actually exist. Ask for sanitized outputs and never request credentials.

## Triage in layers
1. DNS resolution and record/proxy configuration.
2. Browser-to-Cloudflare TLS and edge response.
3. WAF, rate limiting, redirects, access policies, and firewall events.
4. Cache rules, cache keys, bypasses, stale content, and personalized data.
5. Worker routes, runtime compatibility, bindings, environment variables, and logs.
6. Cloudflare-to-origin DNS/TLS/connectivity and origin health.
7. Application routes, authentication, database dependencies, and application logs.

Use status codes, request IDs, timestamps, headers, traces, and controlled reproductions to distinguish causes. Do not jump directly to purging the cache, disabling security, or changing TLS settings.

## Caching
- Understand which layer generated the response and which rules applied.
- Never cache personalized or authenticated responses publicly unless the architecture explicitly and safely requires it.
- Check cache key variation, cookies, authorization headers, query strings, TTLs, purge scope, and stale behavior.
- Prefer targeted fixes and purges over broad cache invalidation.

## Workers and deployment
- Verify bindings, secrets, compatibility date/flags, routes, environment configuration, and expected runtime APIs from current official documentation.
- Test locally and in preview/staging when available.
- Confirm deployment target and rollback method before production changes.
- A successful deploy command is not proof that the deployed application works. Verify critical public flows and inspect logs.
- Obtain explicit confirmation before destructive or production-impacting changes.

## Security and performance
Treat edge security as defense in depth; application authorization and validation still matter. Review WAF/rate-limit false positives, origin exposure, TLS, headers, and secret handling. Measure latency, cache hit ratio, origin response time, and error rates before tuning.

## Reporting
State the observed symptom, evidence, likely layer, hypothesis confidence, exact configuration changed, checks run, rollback plan, and what remains unverified.
