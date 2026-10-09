alter table public.brands
  add column sakenowa_area_rank integer check(sakenowa_area_rank between 1 and 5),
  add column sakenowa_area_score double precision check(sakenowa_area_score between 0 and 5),
  add column sakenowa_area_id integer check(sakenowa_area_id>=0),
  add column sakenowa_area_name text;

-- Same deterministic reading key used by the expanded client-side list.
create function public.shop_brand_sort_key(p_name text,p_kana text) returns text
language sql immutable set search_path='' as $$
  select lower(translate(
    normalize(coalesce(nullif(trim(p_kana),''),p_name),NFKC),
    'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ',
    'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ'
  ));
$$;

drop function public.shop_brand_previews(uuid[],integer);
create function public.shop_brand_previews(p_shop_ids uuid[],p_limit integer default 10)
returns table(
  shop_id uuid,total bigint,brand_id uuid,brand_name text,brand_name_kana text,
  brewery_id uuid,sakenowa_rank integer,sakenowa_score double precision,
  sakenowa_rank_year_month text,registration_status text,
  sakenowa_area_rank integer,sakenowa_area_score double precision,
  sakenowa_area_id integer,sakenowa_area_name text
)
language sql stable security invoker set search_path='' as $$
  with ranked as (
    select sb.shop_id,count(*) over(partition by sb.shop_id) as total,
      b.id as brand_id,b.name as brand_name,b.name_kana as brand_name_kana,
      b.brewery_id,b.sakenowa_rank,b.sakenowa_score,b.sakenowa_rank_year_month,
      b.registration_status,b.sakenowa_area_rank,b.sakenowa_area_score,
      b.sakenowa_area_id,b.sakenowa_area_name,
      row_number() over(partition by sb.shop_id order by
        case when b.sakenowa_rank is not null then 0
          when b.sakenowa_area_rank between 1 and 5 then 1 else 2 end,
        b.sakenowa_rank asc nulls last,b.sakenowa_area_rank asc nulls last,
        public.shop_brand_sort_key(b.name,b.name_kana) collate "C",b.id
      ) as position
    from public.shop_brands sb
    join public.brands b on b.id=sb.brand_id and b.is_active
    where sb.shop_id=any(p_shop_ids) and sb.is_active
      and b.registration_status in ('pending','approved')
      and (b.registration_status='pending' or exists(
        select 1 from public.breweries w where w.id=b.brewery_id and w.is_active
      ))
  )
  select r.shop_id,r.total,r.brand_id,r.brand_name,r.brand_name_kana,r.brewery_id,
    r.sakenowa_rank,r.sakenowa_score,r.sakenowa_rank_year_month,r.registration_status,
    r.sakenowa_area_rank,r.sakenowa_area_score,r.sakenowa_area_id,r.sakenowa_area_name
  from ranked r where r.position<=least(greatest(p_limit,1),20)
  order by r.shop_id,r.position;
$$;
revoke execute on function public.shop_brand_previews(uuid[],integer),
  public.shop_brand_sort_key(text,text) from public,anon,authenticated;
grant execute on function public.shop_brand_previews(uuid[],integer),
  public.shop_brand_sort_key(text,text) to anon,authenticated;
