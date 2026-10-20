-- 032_core_social_reels — platform core (docs/SOCIAL-MANAGER.md §3 video, §4.7).
-- Written in artist-platform on 18 Oct 2026; a verbatim copy is
-- core/supabase/migrations/core_032_social_reels.sql. Founder's ask the same
-- day: reels, a check-and-edit step before approval, and templates tuned to
-- what the product already knows (releases, gigs, mixes, line-ups).
--
-- 1. A new post format `reel_9x16`: a video the artist uploads, published as a
--    reel (media_type=REELS, shared to the feed). A story may be a video too.
--    social_post_issues() refuses a reel without a video and a video in a feed
--    format.
-- 2. Eight more system templates (data, S8), including a plain reel cover.
-- The templates are seeded with the guard off, like 027 after the hosted
-- db push (app.is_service() does not hold for the CLI's connection there).

-- ---------------------------------------------------------------------------
-- 1. The reel format
-- ---------------------------------------------------------------------------
alter table public.social_posts drop constraint social_posts_format_check;
alter table public.social_posts add constraint social_posts_format_check
  check (format in ('feed_4x5','square','story_9x16','reel_9x16','reel_cover','carousel_page'));
alter table public.social_templates drop constraint social_templates_format_check;
alter table public.social_templates add constraint social_templates_format_check
  check (format in ('feed_4x5','square','story_9x16','reel_9x16','reel_cover','carousel_page'));

-- ---------------------------------------------------------------------------
-- 2. Approval knows about video (the function of 027 with two more checks)
-- ---------------------------------------------------------------------------
create or replace function public.social_post_issues(p_post uuid, p_force boolean default false)
returns text[] language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p public.social_posts; c public.social_accounts; issues text[] := '{}'; n int; v_max int;
begin
  select * into p from public.social_posts where id = p_post;
  if not found or not (app.is_member(p.account_id) or app.is_service()) then
    raise exception 'no such post' using errcode = 'P0002';
  end if;
  select * into c from public.social_accounts where id = p.social_account_id;
  if not public.has_feature(p.account_id, 'social.publish') then
    issues := array_append(issues, 'Scheduling is not included in your plan: copy the text and picture and post them yourself.');
  end if;
  v_max := coalesce((public.feature_value(p.account_id, 'social.scheduled_max'))::text::int, 0);
  select count(*) into n from public.social_posts
   where account_id = p.account_id and status in ('approved','rendering','queued','publishing','held') and id <> p.id;
  if v_max <> -1 and n >= v_max then
    issues := array_append(issues, format('Your plan holds %s scheduled posts at a time.', v_max));
  end if;
  if c.id is null or c.disconnected_at is not null or c.health in ('reconnect','disconnected') then
    issues := array_append(issues, 'Reconnect the account before approving.');
  elsif c.token_expires_at is not null and c.token_expires_at < p.scheduled_for + interval '1 day' then
    issues := array_append(issues, format('Reconnect before approving: the connection ends %s, the post is on %s.',
                               to_char(c.token_expires_at, 'DD Mon'), to_char(p.scheduled_for, 'DD Mon')));
  end if;
  if p.scheduled_for < now() + interval '5 minutes' then
    issues := array_append(issues, 'Pick a time at least five minutes from now.');
  end if;
  if p.scheduled_for > now() + interval '75 days' then
    issues := array_append(issues, 'Pick a time within the next 75 days.');
  end if;
  if p.format = 'story_9x16' and p.caption <> '' then
    issues := array_append(issues, 'A story has no caption: put the words in the picture.');
  end if;
  if p.format = 'reel_9x16' and p.kind <> 'video' then
    issues := array_append(issues, 'A reel needs a video.');
  end if;
  if p.kind = 'video' and p.format not in ('reel_9x16','story_9x16') then
    issues := array_append(issues, 'A video goes out as a reel or a story.');
  end if;
  if char_length(p.caption) > 2200 then issues := array_append(issues, 'The caption is over 2,200 characters.'); end if;
  if app.social_count_hashtags(p.caption) + app.social_count_hashtags(p.first_comment) > 30 then
    issues := array_append(issues, 'More than 30 hashtags across the caption and the first comment.');
  end if;
  if app.social_count_mentions(p.caption) > 20 then issues := array_append(issues, 'More than 20 @mentions in the caption.'); end if;
  if jsonb_array_length(p.media) = 0 and p.template_id is null then
    issues := array_append(issues, 'Add a picture or pick a template.');
  end if;
  if p.kind = 'video' and jsonb_array_length(p.media) = 0 then
    issues := array_append(issues, 'Upload the video first.');
  end if;
  -- daily cap: posts on this connection in the 24 h around the slot
  select count(*) into n from public.social_posts
   where social_account_id = p.social_account_id and id <> p.id
     and status in ('approved','rendering','queued','publishing','published','held')
     and scheduled_for between p.scheduled_for - interval '24 hours' and p.scheduled_for + interval '24 hours';
  if c.id is not null and n >= c.daily_cap then
    issues := array_append(issues, format('That day already has %s posts on this account (your cap).', c.daily_cap));
  end if;
  -- spacing: 90 minutes between posts to one account; stories exempt
  if p.format <> 'story_9x16' then
    select count(*) into n from public.social_posts
     where social_account_id = p.social_account_id and id <> p.id and format <> 'story_9x16'
       and status in ('approved','rendering','queued','publishing','published','held')
       and abs(extract(epoch from (scheduled_for - p.scheduled_for))) < 5400;
    if n > 0 then issues := array_append(issues, 'Another post goes to this account within 90 minutes.'); end if;
  end if;
  -- duplicate: same caption and media to the same account within 7 days (needs a second tap)
  if not p_force then
    select count(*) into n from public.social_posts
     where social_account_id = p.social_account_id and id <> p.id and caption = p.caption and media = p.media
       and status in ('approved','rendering','queued','publishing','published','held')
       and abs(extract(epoch from (scheduled_for - p.scheduled_for))) < 7 * 86400;
    if n > 0 then issues := array_append(issues, 'duplicate:The same post already goes to this account this week. Approve again to send it anyway.'); end if;
  end if;
  return issues;
end $$;

-- ---------------------------------------------------------------------------
-- 3. More system templates, tuned to what the product already knows: a release,
--    a new gig as a story, a new mix as a story, a thank-you story, a line-up
--    card, a countdown for the feed, and a plain cover for reels.
-- ---------------------------------------------------------------------------
alter table public.social_templates disable trigger social_templates_guard;
insert into public.social_templates (account_id, key, name, family, platform, format, slots, layout) values
(null, 'release_feed', 'New release', 'release', 'instagram', 'feed_4x5', array['title','label','date','photo'],
 $j${"type":"div","props":{"style":{"display":"flex","flexDirection":"column","alignItems":"center","width":"1080px","height":"1350px","backgroundColor":"{{brand.primary}}","color":"{{brand.secondary}}","fontFamily":"{{brand.font}}","padding":"72px"},"children":[
   {"type":"div","props":{"style":{"display":"flex","width":"100%","alignItems":"center","justifyContent":"space-between"},"children":[
     {"type":"div","props":{"style":{"fontSize":"34px","letterSpacing":"6px","textTransform":"uppercase","opacity":0.85},"children":"Out now"}},
     {"type":"img","props":{"src":"{{brand.logo}}","style":{"width":"110px","height":"110px","objectFit":"contain"}}}
   ]}},
   {"type":"img","props":{"src":"{{photo}}","style":{"marginTop":"48px","width":"860px","height":"860px","objectFit":"cover","borderRadius":"20px"}}},
   {"type":"div","props":{"style":{"marginTop":"48px","width":"100%","fontSize":"72px","fontWeight":700,"lineHeight":1.05},"children":"{{title}}"}},
   {"type":"div","props":{"style":{"marginTop":"14px","width":"100%","display":"flex","justifyContent":"space-between","fontSize":"34px","opacity":0.85},"children":[
     {"type":"div","props":{"children":"{{label}}"}},
     {"type":"div","props":{"children":"{{date}}"}}
   ]}}
 ]}}$j$::jsonb),
(null, 'release_story', 'New release (story)', 'release', 'instagram', 'story_9x16', array['title','label','photo'],
 $j${"type":"div","props":{"style":{"display":"flex","flexDirection":"column","alignItems":"center","justifyContent":"center","width":"1080px","height":"1920px","backgroundColor":"{{brand.primary}}","color":"{{brand.secondary}}","fontFamily":"{{brand.font}}","padding":"96px"},"children":[
   {"type":"div","props":{"style":{"fontSize":"40px","letterSpacing":"8px","textTransform":"uppercase","opacity":0.85},"children":"Out now"}},
   {"type":"img","props":{"src":"{{photo}}","style":{"marginTop":"56px","width":"880px","height":"880px","objectFit":"cover","borderRadius":"24px"}}},
   {"type":"div","props":{"style":{"marginTop":"64px","fontSize":"80px","fontWeight":700,"lineHeight":1.05,"textAlign":"center"},"children":"{{title}}"}},
   {"type":"div","props":{"style":{"marginTop":"16px","fontSize":"38px","opacity":0.85},"children":"{{label}}"}},
   {"type":"img","props":{"src":"{{brand.logo}}","style":{"marginTop":"80px","width":"140px","height":"140px","objectFit":"contain"}}}
 ]}}$j$::jsonb),
(null, 'announce_story', 'New gig (story)', 'announce', 'instagram', 'story_9x16', array['title','venue','date','photo'],
 $j${"type":"div","props":{"style":{"display":"flex","flexDirection":"column","width":"1080px","height":"1920px","backgroundColor":"{{brand.primary}}","color":"{{brand.secondary}}","fontFamily":"{{brand.font}}","position":"relative"},"children":[
   {"type":"img","props":{"src":"{{photo}}","style":{"position":"absolute","top":"0","left":"0","width":"1080px","height":"1920px","objectFit":"cover"}}},
   {"type":"div","props":{"style":{"position":"absolute","top":"0","left":"0","width":"1080px","height":"1920px","backgroundImage":"linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.8) 100%)"}}},
   {"type":"img","props":{"src":"{{brand.logo}}","style":{"position":"absolute","top":"140px","left":"96px","width":"180px","height":"180px","objectFit":"contain"}}},
   {"type":"div","props":{"style":{"position":"absolute","left":"96px","right":"96px","bottom":"300px","display":"flex","flexDirection":"column","gap":"20px"},"children":[
     {"type":"div","props":{"style":{"fontSize":"38px","letterSpacing":"6px","textTransform":"uppercase","opacity":0.9},"children":"New gig"}},
     {"type":"div","props":{"style":{"fontSize":"96px","fontWeight":700,"lineHeight":1.02},"children":"{{title}}"}},
     {"type":"div","props":{"style":{"fontSize":"44px","opacity":0.92},"children":"{{venue}}"}},
     {"type":"div","props":{"style":{"fontSize":"40px","opacity":0.85},"children":"{{date}}"}}
   ]}}
 ]}}$j$::jsonb),
(null, 'mix_story', 'New mix (story)', 'mix', 'instagram', 'story_9x16', array['title','subtitle','photo'],
 $j${"type":"div","props":{"style":{"display":"flex","flexDirection":"column","alignItems":"center","justifyContent":"center","width":"1080px","height":"1920px","backgroundColor":"{{brand.primary}}","color":"{{brand.secondary}}","fontFamily":"{{brand.font}}","padding":"96px"},"children":[
   {"type":"div","props":{"style":{"fontSize":"40px","letterSpacing":"8px","textTransform":"uppercase","opacity":0.85},"children":"New mix"}},
   {"type":"img","props":{"src":"{{photo}}","style":{"marginTop":"56px","width":"880px","height":"880px","objectFit":"cover","borderRadius":"24px"}}},
   {"type":"div","props":{"style":{"marginTop":"64px","fontSize":"76px","fontWeight":700,"lineHeight":1.05,"textAlign":"center"},"children":"{{title}}"}},
   {"type":"div","props":{"style":{"marginTop":"16px","fontSize":"36px","opacity":0.85,"textAlign":"center"},"children":"{{subtitle}}"}},
   {"type":"div","props":{"style":{"marginTop":"60px","fontSize":"34px","opacity":0.8},"children":"Link in bio"}},
   {"type":"img","props":{"src":"{{brand.logo}}","style":{"marginTop":"60px","width":"130px","height":"130px","objectFit":"contain"}}}
 ]}}$j$::jsonb),
(null, 'thank_you_story', 'Thank you (story)', 'thank_you', 'instagram', 'story_9x16', array['city','photo'],
 $j${"type":"div","props":{"style":{"display":"flex","flexDirection":"column","width":"1080px","height":"1920px","backgroundColor":"{{brand.primary}}","color":"{{brand.secondary}}","fontFamily":"{{brand.font}}","position":"relative"},"children":[
   {"type":"img","props":{"src":"{{photo}}","style":{"position":"absolute","top":"0","left":"0","width":"1080px","height":"1920px","objectFit":"cover"}}},
   {"type":"div","props":{"style":{"position":"absolute","top":"0","left":"0","width":"1080px","height":"1920px","backgroundImage":"linear-gradient(180deg, rgba(0,0,0,0.05) 45%, rgba(0,0,0,0.78) 100%)"}}},
   {"type":"div","props":{"style":{"position":"absolute","left":"96px","right":"96px","bottom":"320px","display":"flex","flexDirection":"column","gap":"16px"},"children":[
     {"type":"div","props":{"style":{"fontSize":"52px","opacity":0.9},"children":"Thank you"}},
     {"type":"div","props":{"style":{"fontSize":"132px","fontWeight":700,"lineHeight":1},"children":"{{city}}"}},
     {"type":"div","props":{"style":{"marginTop":"28px","display":"flex","alignItems":"center","gap":"20px"},"children":[
       {"type":"img","props":{"src":"{{brand.logo}}","style":{"width":"96px","height":"96px","objectFit":"contain"}}},
       {"type":"div","props":{"style":{"fontSize":"32px","opacity":0.85},"children":"{{brand.signature}}"}}
     ]}}
   ]}}
 ]}}$j$::jsonb),
(null, 'lineup_feed', 'Line-up', 'announce', 'instagram', 'feed_4x5', array['title','lineup','date','venue'],
 $j${"type":"div","props":{"style":{"display":"flex","flexDirection":"column","justifyContent":"space-between","width":"1080px","height":"1350px","backgroundColor":"{{brand.primary}}","color":"{{brand.secondary}}","fontFamily":"{{brand.font}}","padding":"88px"},"children":[
   {"type":"div","props":{"style":{"display":"flex","alignItems":"center","justifyContent":"space-between"},"children":[
     {"type":"div","props":{"style":{"fontSize":"34px","letterSpacing":"6px","textTransform":"uppercase","opacity":0.85},"children":"{{date}}"}},
     {"type":"img","props":{"src":"{{brand.logo}}","style":{"width":"110px","height":"110px","objectFit":"contain"}}}
   ]}},
   {"type":"div","props":{"style":{"display":"flex","flexDirection":"column","gap":"28px"},"children":[
     {"type":"div","props":{"style":{"fontSize":"84px","fontWeight":700,"lineHeight":1.02},"children":"{{title}}"}},
     {"type":"div","props":{"style":{"fontSize":"46px","lineHeight":1.4,"whiteSpace":"pre-wrap","opacity":0.95},"children":"{{lineup}}"}}
   ]}},
   {"type":"div","props":{"style":{"fontSize":"36px","opacity":0.85},"children":"{{venue}}"}}
 ]}}$j$::jsonb),
(null, 'countdown_feed', 'Countdown (feed)', 'countdown', 'instagram', 'feed_4x5', array['number','title','date'],
 $j${"type":"div","props":{"style":{"display":"flex","flexDirection":"column","alignItems":"center","justifyContent":"center","width":"1080px","height":"1350px","backgroundColor":"{{brand.primary}}","color":"{{brand.secondary}}","fontFamily":"{{brand.font}}","position":"relative"},"children":[
   {"type":"img","props":{"src":"{{brand.logo}}","style":{"position":"absolute","top":"80px","width":"160px","height":"160px","objectFit":"contain"}}},
   {"type":"div","props":{"style":{"fontSize":"40px","letterSpacing":"8px","textTransform":"uppercase","opacity":0.85},"children":"in"}},
   {"type":"div","props":{"style":{"fontSize":"360px","fontWeight":700,"lineHeight":1},"children":"{{number}}"}},
   {"type":"div","props":{"style":{"fontSize":"40px","letterSpacing":"8px","textTransform":"uppercase","opacity":0.85},"children":"days"}},
   {"type":"div","props":{"style":{"position":"absolute","bottom":"120px","left":"80px","right":"80px","display":"flex","flexDirection":"column","alignItems":"center","gap":"12px","textAlign":"center"},"children":[
     {"type":"div","props":{"style":{"fontSize":"60px","fontWeight":700,"lineHeight":1.1},"children":"{{title}}"}},
     {"type":"div","props":{"style":{"fontSize":"34px","opacity":0.85},"children":"{{date}}"}}
   ]}}
 ]}}$j$::jsonb),
(null, 'cover_plain', 'Reel cover', 'plain', 'instagram', 'reel_cover', array['text'],
 $j${"type":"div","props":{"style":{"display":"flex","flexDirection":"column","alignItems":"center","justifyContent":"center","width":"1080px","height":"1920px","backgroundColor":"{{brand.primary}}","color":"{{brand.secondary}}","fontFamily":"{{brand.font}}","padding":"120px 96px"},"children":[
   {"type":"img","props":{"src":"{{brand.logo}}","style":{"width":"220px","height":"220px","objectFit":"contain"}}},
   {"type":"div","props":{"style":{"marginTop":"80px","fontSize":"104px","fontWeight":700,"lineHeight":1.06,"textAlign":"center"},"children":"{{text}}"}},
   {"type":"div","props":{"style":{"marginTop":"60px","fontSize":"34px","opacity":0.8},"children":"{{brand.signature}}"}}
 ]}}$j$::jsonb)
on conflict do nothing;
alter table public.social_templates enable trigger social_templates_guard;
