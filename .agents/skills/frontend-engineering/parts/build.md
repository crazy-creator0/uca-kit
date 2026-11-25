## Implementation
1. Confirm user-visible behavior and acceptance criteria.
2. Inspect existing components, styles, routing, package scripts, and test setup.
3. Build one vertical slice with loading, success, empty, and error states as relevant.
4. Keep UI components focused; move shared behavior into hooks/utilities only when useful.
5. Validate inputs on the client for usability, but never treat client validation as server-side security.
6. Handle asynchronous operations, cancellation/races, and duplicate submissions where relevant.
7. Use semantic HTML, keyboard access, visible focus, labels, and appropriate contrast.
8. Avoid unnecessary dependencies and global state.
9. Test important behavior and verify responsive layouts.

## API integration
- Use explicit API base configuration per environment.
- Handle non-2xx responses, network failures, and malformed responses.
- Do not put server secrets in browser-exposed variables or bundles.
- Align request/response types with the backend contract.
- Treat CORS as a server/browser policy, not authentication.
