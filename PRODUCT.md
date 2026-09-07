# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary Settings user is a СМ ТЕХНО administrator managing employee accounts and the application’s connection behavior with 1C from desktop and mobile browsers. Regular users authenticate and use their own assigned 1C credentials but cannot enter administrative Settings or reveal credentials.

## Product Purpose

СМ ТЕХНО is an internal operational application for catalog, customer, document, order, and 1C-connected workflows. The Settings area lets an administrator manage accounts and configure existing global 1C behavior without exposing infrastructure secrets or changing operational business logic.

## Positioning

The product combines local operational data and per-user 1C access in one controlled workspace: each employee signs in to СМ ТЕХНО with an application account and can use independently assigned 1C credentials.

## Operating Context

Administrators work from both desktop and mobile. Desktop administration benefits from list/detail comparison and full forms; mobile administration requires separate screens, large touch targets, sheets/accordions, and sticky actions. Settings changes must remain isolated from concurrent work on order delivery, validation, stock concurrency, 1C transport reliability, and CRM.

## Capabilities and Constraints

- Settings has exactly two top-level destinations: Users and 1C Integration.
- User administration covers identity, role, active state, application password, and individual 1C username/password.
- Hash-based authentication remains authoritative; a separate encrypted recoverable copy exists only for permitted admin reveal.
- Admin reveal is limited to the user’s СМ ТЕХНО password and that user’s individual 1C password.
- Global 1C system settings and individual user credentials are separate concepts.
- Connection testing uses the existing `/api/onec/test` behavior and never saves settings.
- Unsaved changes must not be discarded silently.
- The application remains Next.js/React/TypeScript/Tailwind on the frontend and FastAPI/SQLite on the backend.

## Brand Commitments

The product name is «СМ ТЕХНО». Existing navy and yellow brand colors, logo assets, concise Russian operational language, and a restrained non-cartoon B2B character remain binding.

## Evidence on Hand

- Existing product routes, auth roles, API contracts, and visual tokens in the repository.
- Existing logo and icon assets under `sm-techno-web/public`.
- No testimonials, public marketing claims, or external benchmark data are provided; future UI must not fabricate them.

## Product Principles

1. Separate administrative jobs before adding controls.
2. Make every action label describe its exact effect.
3. Keep user secrets narrowly scoped, explicitly requested, and short-lived in the browser.
4. Preserve operational business behavior while improving administration.
5. Treat desktop and mobile as distinct interaction contexts sharing one contract.

## Accessibility & Inclusion

Settings must support keyboard navigation, visible focus, semantic labels, readable contrast, reduced-motion preferences, and touch targets appropriate for mobile use.
