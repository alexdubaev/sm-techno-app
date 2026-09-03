# Sites API Proxy Design

## Goal

Make the published application reachable from networks that block direct access to the Tailscale Funnel hostname.

## Design

The browser calls only same-origin `/api/*` URLs on the published Sites domain. A catch-all server route forwards those requests to the existing backend Funnel URL. It preserves the request method, body, query string, authorization, content type, response status, response body, and download headers.

The browser bundle contains no Tailscale API hostname. The backend URL remains a server-only runtime setting, with the current Funnel URL as the deployment fallback until a Sites environment variable is configured.

## Error handling

The proxy returns a `502` JSON response if the upstream is unreachable. Existing client timeout and error handling render that response to the user without exposing internal network details.

## Verification

Run source regression tests and production build, deploy the Site, then verify that a request from the published origin reaches `/api/health` and that the login request path is same-origin.
