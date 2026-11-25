## Testing strategy
Choose tests according to risk:
- Unit tests for isolated business rules.
- API tests for contracts, validation, auth, and error responses.
- Integration tests for database and external boundaries.
- Component tests for UI behavior.
- End-to-end tests for critical user journeys.

Test meaningful edge cases: empty input/results, malformed data, duplicate requests, unauthorized access, missing resources, timeouts, failed dependencies, and concurrent updates where relevant.

## Review checklist
1. Correctness and acceptance criteria.
2. Simplicity, naming, and readability.
3. Security, authorization, and data privacy.
4. Error handling and edge cases.
5. Database correctness and query behavior.
6. Performance based on evidence.
7. Test quality and regression coverage.
8. Accessibility and UX where relevant.
9. Observability and operational impact.
10. Maintainability and documentation.
