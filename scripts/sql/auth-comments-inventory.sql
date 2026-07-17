select
  thread_id,
  case
    when thread_id like 'page:/%' then 'page'
    when thread_id like 'ai-gallery:%' then 'ai-gallery'
    when thread_id like 'ai-video:%' then 'ai-video'
    else 'unknown'
  end as thread_kind,
  count(*) as total,
  count(*) filter (where parent_id is null) as roots,
  count(*) filter (where parent_id is not null) as replies,
  min(created_at) as first_at,
  max(created_at) as last_at
from public.comments
group by thread_id
order by thread_id;
