-- Dedicated negotiation log: a chronological, two-way feed of messages and
-- amount changes between Borrower and Committee during the post-approval
-- negotiation loop. Previously amount changes were only a terse note buried
-- in the general application status_history, and there was no way for
-- either side to leave a free-text message at all.
create table public.negotiation_messages (
  id uuid primary key default gen_random_uuid(),
  loan_application_id uuid not null references public.loan_applications(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  author_role text not null check (author_role in ('borrower', 'committee')),
  -- 'offer' = system-generated entry logged alongside a counter-offer/override
  -- amount change; 'message' = a free-text note with no amount attached.
  kind text not null default 'message' check (kind in ('message', 'offer')),
  body text,
  amount numeric,
  created_at timestamptz not null default now(),
  constraint negotiation_messages_offer_has_amount
    check (kind <> 'offer' or amount is not null)
);

create index negotiation_messages_application_idx
  on public.negotiation_messages (loan_application_id, created_at);

alter table public.negotiation_messages enable row level security;

-- Same visibility as the negotiations table itself: super admin, negotiation/
-- committee module viewers (CSA holds negotiation view too), or the owning
-- borrower.
create policy negotiation_messages_select on public.negotiation_messages
  for select
  using (
    is_super_admin()
    or has_module_permission('negotiation', 'view')
    or has_module_permission('committee', 'view')
    or exists (
      select 1
      from public.loan_applications la
      join public.borrowers b on b.id = la.borrower_id
      where la.id = negotiation_messages.loan_application_id
        and b.user_id = auth.uid()
    )
  );

-- Committee can post any time they hold edit permission on the negotiation.
create policy negotiation_messages_insert_committee on public.negotiation_messages
  for insert
  with check (
    author_id = auth.uid()
    and author_role = 'committee'
    and (is_super_admin() or has_module_permission('committee', 'edit'))
  );

-- Borrower can post only on their own application, and only while it's in an
-- active negotiation stage — same status list as negotiations_borrower_counter.
create policy negotiation_messages_insert_borrower on public.negotiation_messages
  for insert
  with check (
    author_id = auth.uid()
    and author_role = 'borrower'
    and exists (
      select 1
      from public.loan_applications la
      join public.borrowers b on b.id = la.borrower_id
      where la.id = negotiation_messages.loan_application_id
        and b.user_id = auth.uid()
        and la.status = any (array['approved', 'awaiting_confirmation', 'negotiating_terms'])
    )
  );
