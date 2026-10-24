-- Treat hiragana ず/づ and じ/ぢ as the same characters while searching.
create or replace function public.normalize_kana_search(p_value text)
returns text
language sql immutable parallel safe set search_path='' as $$
  select replace(
    replace(lower(coalesce(p_value, '')), 'づ', 'ず'),
    'ぢ',
    'じ'
  );
$$;
