# CRM reminders: rescheduling and open-app notifications

## Decision

Reminders remain local CRM data.  They are delivered only while an
authenticated CRM user has this web application open and connected to its
server.  The server is the authority for deadlines: every submitted deadline
is an offset-bearing ISO-8601 instant, stored and returned as canonical UTC.
The interface explicitly edits and displays those instants in Moscow time
(MSK, UTC+03:00).

No email, push, browser-background notification, scheduled job, outbound
delivery mechanism, or 1C request is part of this change.

## Data model

`crm_reminders.due_at` contains canonical UTC ISO-8601 timestamps.  Creation
and rescheduling reject omitted, malformed, or offset-free dates before a
database write.  Existing active reminders retain their current rows; all new
and updated values meet the UTC contract.

Add an immutable `crm_reminder_history` table.  Each reschedule transaction
inserts one row containing the reminder id, actor id, old UTC deadline, new
UTC deadline, and creation timestamp, then updates the active reminder and
its `updated_at` version.  History is returned with the reminder/card so a
person can see both sides of every deadline transfer.

## API and authorization

`POST /api/crm/reminders/{id}/reschedule` accepts `dueAt` and
`expectedUpdatedAt`.  It permits only the reminder owner, requires an active
row and exact optimistic-lock version, and returns the updated reminder plus
canonical UTC deadline.  Missing or non-instant input is HTTP 400; missing
reminders are 404; stale and terminal rows are 409; a non-owner is 403.

`GET /api/crm/reminders/due` is authenticated and intentionally derives the
owner only from the current session.  It returns active rows owned by that
user whose deadline is due or overdue at the supplied/current UTC instant,
ordered by `(due_at, id)`, with a safe client display label.  It has no
`ownerId` parameter, so an administrator viewing an employee workspace cannot
subscribe to or retrieve that employee's reminders.

Existing owner/admin read permissions remain unchanged.  Completion,
cancellation, creation, and rescheduling retain their current owner checks
and optimistic locking.

## Frontend behaviour

The CRM detail dialog uses a Moscow-local `datetime-local` input labelled
`МСК`.  It converts that value to an offset-bearing UTC instant on creation
and rescheduling; lists, history, and reminder labels format stored UTC values
in Moscow time regardless of the browser timezone.  Rescheduling updates the
card's local state only after the versioned API call succeeds.

The authenticated `AppShell` mounts the toast provider and a small reminder
notifier.  It fetches the current-user due endpoint after initial load, every
60 seconds, and when the document becomes visible or window regains focus.
For each returned `(reminder id, updatedAt)` identity it shows at most one
toast for the lifetime of the page.  The toast includes the client label and
Moscow deadline and navigates to `/crm` when activated.  The set is held only
in page memory: checking, showing, or dismissing a toast never writes a
read/seen state and never completes a reminder.  Rescheduling changes
`updatedAt`, making the new deadline eligible for one new toast.

## Error handling and verification

The client presents API failures without committing an optimistic reschedule.
Notifier fetch failures are non-disruptive and are retried by the next trigger.
All tests stay offline with temporary SQLite databases and mocked browser/API
boundaries; no 1C access is allowed.

Verification covers UTC input and Moscow conversion, immutable old/new
history, owner and administrator boundaries, version conflicts and terminal
reminders, due-query filtering/order, and notifier initial/interval/focus
deduplication including a new notification after rescheduling.  It also runs
the targeted Python and Node suites, TypeScript no-emit, production build, and
an independent read-only review.
