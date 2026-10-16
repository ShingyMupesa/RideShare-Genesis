-- Captures the role a user said they wanted at signup (driver | passenger |
-- both), set from the /get-started campaign page's selector and carried
-- through registration as `?intent=`. Purely informational — it doesn't
-- gate anything a user can do, and is null for anyone who registered
-- without passing through that page.
ALTER TABLE users ADD COLUMN travel_intent TEXT;
