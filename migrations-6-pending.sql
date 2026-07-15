-- Migration 6: display name (staged, NOT applied — apply at next "push")
-- Adds a proper name field instead of deriving the greeting from the email
-- prefix. Nullable — falls back to the existing email-derived name in the
-- app until the user sets one.

alter table public.profiles
  add column if not exists display_name text;
