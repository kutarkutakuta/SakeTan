alter table public.brands
  add column sakenowa_rank integer,
  add column sakenowa_score double precision,
  add column sakenowa_rank_year_month text;

alter table public.brands
  add constraint brands_sakenowa_rank_check
    check (sakenowa_rank is null or sakenowa_rank > 0),
  add constraint brands_sakenowa_score_check
    check (sakenowa_score is null or sakenowa_score between 0 and 5),
  add constraint brands_sakenowa_rank_month_check
    check (
      sakenowa_rank_year_month is null
      or sakenowa_rank_year_month ~ '^[0-9]{6}$'
    );
