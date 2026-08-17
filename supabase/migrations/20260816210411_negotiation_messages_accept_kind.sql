-- Distinct 'accept' kind so the negotiation log can tell "here's a new
-- number" (offer) apart from "I agree to this number" (accept) — both
-- Borrower signing disclosed terms and Committee's Accept action log here.
alter table public.negotiation_messages
  drop constraint negotiation_messages_kind_check;

alter table public.negotiation_messages
  add constraint negotiation_messages_kind_check
  check (kind = any (array['message', 'offer', 'accept']));

alter table public.negotiation_messages
  drop constraint negotiation_messages_offer_has_amount;

alter table public.negotiation_messages
  add constraint negotiation_messages_offer_has_amount
  check (kind not in ('offer', 'accept') or amount is not null);
