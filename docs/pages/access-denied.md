# Access Denied Page

## Route
Shown when an admin-only route is accessed without permission (users, exports, simulation).

## Component
src/ui/pages/AccessDeniedPage.tsx

## Purpose
Explain that the viewer lacks access and redirect them back to home.

## Data and state
- Uses useNavigate from react-router-dom.
- No external data dependencies.

## Key UI
- Card with title, brief message, and a button to go home.

## Behavior
- Auto-redirects to / after 3 seconds.
