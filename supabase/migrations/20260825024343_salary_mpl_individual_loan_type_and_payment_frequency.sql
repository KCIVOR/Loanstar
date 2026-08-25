alter table loan_applications
  add column individual_loan_type text check (individual_loan_type in ('mpl','salary'));

alter table computations
  add column payment_frequency text not null default 'monthly' check (payment_frequency in ('monthly','semi_monthly'));
