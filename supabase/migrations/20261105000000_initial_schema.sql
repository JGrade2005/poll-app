-- =============================================================================
-- Classroom Survey Web App: initial database schema
--
-- How to apply (pick one):
--   * Supabase Dashboard -> SQL Editor -> paste this whole file -> Run
--   * Supabase CLI:  supabase link --project-ref <ref> && supabase db push
--
-- Implements DATABASE.md and API.md:
--   tables      surveys, questions, choices, responses, answers
--   integrity   primary keys, foreign keys (cascade), check constraints,
--               partial unique index "only one active survey",
--               unique (survey_id, anonymous_token) for duplicate protection
--   security    Row Level Security on every table
--               anon (students): read ONLY the active survey + its questions/choices,
--                                submit ONLY through submit_survey_response()
--               authenticated (instructor): full access
--   functions   activate_survey, close_survey, submit_survey_response,
--               get_public_survey, get_survey_results, save_survey, duplicate_survey
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------

create table if not exists public.surveys (
    id          uuid primary key default gen_random_uuid(),
    title       text not null check (length(btrim(title)) > 0),
    description text,
    status      text not null default 'draft'
                check (status in ('draft', 'active', 'closed', 'archived')),
    public_slug text unique,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table if not exists public.questions (
    id            uuid primary key default gen_random_uuid(),
    survey_id     uuid not null references public.surveys(id) on delete cascade,
    question_text text not null check (length(btrim(question_text)) > 0),
    question_type text not null
                  check (question_type in ('multiple_choice', 'true_false')),
    position      integer not null,
    created_at    timestamptz not null default now()
);

create table if not exists public.choices (
    id          uuid primary key default gen_random_uuid(),
    question_id uuid not null references public.questions(id) on delete cascade,
    choice_text text not null check (length(btrim(choice_text)) > 0),
    position    integer not null,
    created_at  timestamptz not null default now()
);

create table if not exists public.responses (
    id              uuid primary key default gen_random_uuid(),
    survey_id       uuid not null references public.surveys(id) on delete cascade,
    anonymous_token text,
    submitted_at    timestamptz not null default now()
);

create table if not exists public.answers (
    id          uuid primary key default gen_random_uuid(),
    response_id uuid not null references public.responses(id) on delete cascade,
    question_id uuid not null references public.questions(id) on delete cascade,
    choice_id   uuid references public.choices(id) on delete set null,
    text_answer text,
    created_at  timestamptz not null default now(),
    unique (response_id, question_id)
);


-- -----------------------------------------------------------------------------
-- 2. Indexes
-- -----------------------------------------------------------------------------

create index if not exists surveys_status_idx          on public.surveys(status);
create index if not exists questions_survey_id_idx     on public.questions(survey_id);
create index if not exists choices_question_id_idx     on public.choices(question_id);
create index if not exists responses_survey_id_idx     on public.responses(survey_id);
create index if not exists responses_submitted_at_idx  on public.responses(submitted_at);
create index if not exists answers_response_id_idx     on public.answers(response_id);
create index if not exists answers_question_id_idx     on public.answers(question_id);
create index if not exists answers_choice_id_idx       on public.answers(choice_id);

-- Only one survey may be active at any time (DATABASE.md section 5).
create unique index if not exists only_one_active_survey
    on public.surveys ((status))
    where status = 'active';

-- One submission per browser token per survey (DATABASE.md section 3, responses).
create unique index if not exists responses_unique_student_per_survey
    on public.responses(survey_id, anonymous_token)
    where anonymous_token is not null;


-- -----------------------------------------------------------------------------
-- 3. updated_at trigger
-- -----------------------------------------------------------------------------

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists surveys_updated_at on public.surveys;
create trigger surveys_updated_at
    before update on public.surveys
    for each row
    execute function public.update_updated_at_column();


-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------

alter table public.surveys   enable row level security;
alter table public.questions enable row level security;
alter table public.choices   enable row level security;
alter table public.responses enable row level security;
alter table public.answers   enable row level security;

-- Table privileges. RLS policies below decide WHICH rows each role may touch;
-- these grants decide WHICH operations are possible at all.
-- Students (anon) get read-only access to survey content and nothing on
-- responses/answers: they submit exclusively through submit_survey_response().
revoke all on public.surveys, public.questions, public.choices,
              public.responses, public.answers from anon;
grant select on public.surveys, public.questions, public.choices to anon;
grant select, insert, update, delete on public.surveys, public.questions, public.choices,
              public.responses, public.answers to authenticated;

-- ---- Students (anon): read only the active survey ---------------------------

drop policy if exists "students read active surveys" on public.surveys;
create policy "students read active surveys"
    on public.surveys
    for select
    to anon
    using (status = 'active');

drop policy if exists "students read active survey questions" on public.questions;
create policy "students read active survey questions"
    on public.questions
    for select
    to anon
    using (
        exists (
            select 1
            from public.surveys
            where surveys.id = questions.survey_id
              and surveys.status = 'active'
        )
    );

drop policy if exists "students read active survey choices" on public.choices;
create policy "students read active survey choices"
    on public.choices
    for select
    to anon
    using (
        exists (
            select 1
            from public.questions
            join public.surveys on surveys.id = questions.survey_id
            where questions.id = choices.question_id
              and surveys.status = 'active'
        )
    );

-- No anon policies exist on responses/answers, so students can neither read
-- results nor insert rows directly.

-- ---- Instructor (authenticated): full access --------------------------------
-- Single-instructor deployment (DATABASE.md section 10). Public sign-ups MUST be
-- disabled in Supabase Auth so that the only authenticated users are instructors.

drop policy if exists "authenticated users manage surveys" on public.surveys;
create policy "authenticated users manage surveys"
    on public.surveys for all to authenticated
    using (true) with check (true);

drop policy if exists "authenticated users manage questions" on public.questions;
create policy "authenticated users manage questions"
    on public.questions for all to authenticated
    using (true) with check (true);

drop policy if exists "authenticated users manage choices" on public.choices;
create policy "authenticated users manage choices"
    on public.choices for all to authenticated
    using (true) with check (true);

drop policy if exists "authenticated users manage responses" on public.responses;
create policy "authenticated users manage responses"
    on public.responses for all to authenticated
    using (true) with check (true);

drop policy if exists "authenticated users manage answers" on public.answers;
create policy "authenticated users manage answers"
    on public.answers for all to authenticated
    using (true) with check (true);


-- -----------------------------------------------------------------------------
-- 5. Helper: random public slug (non-sequential, hard to guess)
-- -----------------------------------------------------------------------------
-- 8 characters from a 31-character alphabet without look-alikes (0/o, 1/l/i):
-- about 40 bits of randomness. gen_random_uuid() uses a cryptographic RNG.

create or replace function public.generate_public_slug()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
    alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
    random_bytes bytea;
    slug text;
begin
    loop
        random_bytes := uuid_send(gen_random_uuid());
        slug := '';
        -- bytes 6 and 8 hold the UUID version/variant bits, so skip them
        for i in 0..15 loop
            continue when i in (6, 8);
            slug := slug || substr(alphabet, (get_byte(random_bytes, i) % 31) + 1, 1);
            exit when length(slug) = 8;
        end loop;
        exit when not exists (select 1 from public.surveys where public_slug = slug);
    end loop;
    return slug;
end;
$$;

revoke execute on function public.generate_public_slug() from public, anon;
grant execute on function public.generate_public_slug() to authenticated;


-- -----------------------------------------------------------------------------
-- 6. Activation / closing (instructor only)
-- -----------------------------------------------------------------------------

-- API.md section 7: close any active survey, create a slug if needed,
-- activate the requested survey, return id/status/public_slug.
create or replace function public.activate_survey(p_survey_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_survey public.surveys%rowtype;
begin
    -- Serialize activations so two simultaneous clicks cannot race each other.
    perform pg_advisory_xact_lock(hashtext('public.activate_survey'));

    select * into v_survey from public.surveys where id = p_survey_id for update;
    if not found then
        raise exception 'SURVEY_NOT_FOUND' using errcode = 'P0001';
    end if;

    if not exists (select 1 from public.questions where survey_id = p_survey_id) then
        raise exception 'SURVEY_HAS_NO_QUESTIONS' using errcode = 'P0001';
    end if;

    -- 1. close the currently active survey (if it is a different one)
    update public.surveys
       set status = 'closed'
     where status = 'active'
       and id <> p_survey_id;

    -- 2 + 3. make sure a slug exists and activate the requested survey
    update public.surveys
       set status = 'active',
           public_slug = coalesce(public_slug, public.generate_public_slug())
     where id = p_survey_id
    returning * into v_survey;

    -- 4. return the survey and its public slug
    return jsonb_build_object(
        'id', v_survey.id,
        'status', v_survey.status,
        'public_slug', v_survey.public_slug
    );
end;
$$;

-- API.md section 8: status = closed. Submissions fail immediately afterwards
-- because submit_survey_response() checks the status inside its transaction.
create or replace function public.close_survey(p_survey_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_survey public.surveys%rowtype;
begin
    update public.surveys
       set status = 'closed'
     where id = p_survey_id
       and status = 'active'
    returning * into v_survey;

    if not found then
        select * into v_survey from public.surveys where id = p_survey_id;
        if not found then
            raise exception 'SURVEY_NOT_FOUND' using errcode = 'P0001';
        end if;
    end if;

    return jsonb_build_object('id', v_survey.id, 'status', v_survey.status);
end;
$$;

revoke execute on function public.activate_survey(uuid) from public, anon;
revoke execute on function public.close_survey(uuid) from public, anon;
grant execute on function public.activate_survey(uuid) to authenticated;
grant execute on function public.close_survey(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 7. Public student survey (anon)
-- -----------------------------------------------------------------------------
-- Resolves /s/:slug. Returns the full survey only while it is active; for a
-- closed/archived survey it returns just {"status": "closed"} so the student
-- sees "no longer accepting responses" instead of "not found".
-- Never returns any response data (API.md section 9).

create or replace function public.get_public_survey(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_survey public.surveys%rowtype;
begin
    -- The short slug is the normal route; the survey UUID is also accepted
    -- (DATABASE.md section 6: "UUIDs may also be used directly").
    if p_slug ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select * into v_survey from public.surveys where id = p_slug::uuid;
    else
        select * into v_survey from public.surveys where public_slug = p_slug;
    end if;

    if not found or v_survey.status = 'draft' then
        return jsonb_build_object('status', 'not_found');
    end if;

    if v_survey.status <> 'active' then
        return jsonb_build_object('status', 'closed');
    end if;

    return jsonb_build_object(
        'status', 'active',
        'survey', jsonb_build_object(
            'id', v_survey.id,
            'title', v_survey.title,
            'description', v_survey.description
        ),
        'questions', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'id', q.id,
                    'question_text', q.question_text,
                    'question_type', q.question_type,
                    'position', q.position,
                    'choices', coalesce((
                        select jsonb_agg(
                            jsonb_build_object(
                                'id', c.id,
                                'choice_text', c.choice_text,
                                'position', c.position
                            ) order by c.position, c.created_at
                        )
                        from public.choices c
                        where c.question_id = q.id
                    ), '[]'::jsonb)
                ) order by q.position, q.created_at
            )
            from public.questions q
            where q.survey_id = v_survey.id
        ), '[]'::jsonb)
    );
end;
$$;

revoke execute on function public.get_public_survey(text) from public;
grant execute on function public.get_public_survey(text) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 8. Student submission (anon), API.md section 10 / DATABASE.md section 9
-- -----------------------------------------------------------------------------
-- Runs in ONE transaction. Validates everything before inserting anything.
-- Errors (raised as the exception message):
--   SURVEY_NOT_ACTIVE, DUPLICATE_RESPONSE, INVALID_QUESTION, INVALID_CHOICE,
--   MISSING_REQUIRED_ANSWER, INVALID_PAYLOAD

create or replace function public.submit_survey_response(
    p_survey_id uuid,
    p_anonymous_token text,
    p_answers jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_status      text;
    v_token       text := nullif(btrim(p_anonymous_token), '');
    v_response_id uuid;
    v_answer      jsonb;
    v_question_id uuid;
    v_choice_id   uuid;
    v_seen        uuid[] := '{}';
begin
    -- Lock the survey row in SHARE mode: many students can submit at once,
    -- but close_survey() has to wait for in-flight submissions, and any
    -- submission that starts after the close sees status = 'closed'.
    select status into v_status
      from public.surveys
     where id = p_survey_id
       for share;

    if v_status is distinct from 'active' then
        raise exception 'SURVEY_NOT_ACTIVE' using errcode = 'P0001';
    end if;

    if v_token is not null and length(v_token) > 200 then
        raise exception 'INVALID_PAYLOAD' using errcode = 'P0001';
    end if;

    if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
        raise exception 'INVALID_PAYLOAD' using errcode = 'P0001';
    end if;

    if v_token is not null and exists (
        select 1 from public.responses
         where survey_id = p_survey_id and anonymous_token = v_token
    ) then
        raise exception 'DUPLICATE_RESPONSE' using errcode = 'P0001';
    end if;

    -- Validate every answer before writing anything.
    for v_answer in select * from jsonb_array_elements(p_answers) loop
        if jsonb_typeof(v_answer) <> 'object' then
            raise exception 'INVALID_PAYLOAD' using errcode = 'P0001';
        end if;

        begin
            v_question_id := (v_answer ->> 'question_id')::uuid;
        exception when invalid_text_representation then
            raise exception 'INVALID_QUESTION' using errcode = 'P0001';
        end;

        if v_question_id is null
           or v_question_id = any(v_seen)
           or not exists (
                select 1 from public.questions
                 where id = v_question_id and survey_id = p_survey_id
           ) then
            raise exception 'INVALID_QUESTION' using errcode = 'P0001';
        end if;
        v_seen := v_seen || v_question_id;

        begin
            v_choice_id := (v_answer ->> 'choice_id')::uuid;
        exception when invalid_text_representation then
            raise exception 'INVALID_CHOICE' using errcode = 'P0001';
        end;

        if v_choice_id is null then
            raise exception 'MISSING_REQUIRED_ANSWER' using errcode = 'P0001';
        end if;

        if not exists (
            select 1 from public.choices
             where id = v_choice_id and question_id = v_question_id
        ) then
            raise exception 'INVALID_CHOICE' using errcode = 'P0001';
        end if;
    end loop;

    -- Every question in Version 1 is required.
    if exists (
        select 1 from public.questions
         where survey_id = p_survey_id
           and not (id = any(v_seen))
    ) then
        raise exception 'MISSING_REQUIRED_ANSWER' using errcode = 'P0001';
    end if;

    begin
        insert into public.responses (survey_id, anonymous_token)
        values (p_survey_id, v_token)
        returning id into v_response_id;
    exception when unique_violation then
        -- two simultaneous submits from the same browser
        raise exception 'DUPLICATE_RESPONSE' using errcode = 'P0001';
    end;

    insert into public.answers (response_id, question_id, choice_id)
    select v_response_id,
           (a ->> 'question_id')::uuid,
           (a ->> 'choice_id')::uuid
      from jsonb_array_elements(p_answers) as a;

    return jsonb_build_object('success', true, 'response_id', v_response_id);
end;
$$;

revoke execute on function public.submit_survey_response(uuid, text, jsonb) from public;
grant execute on function public.submit_survey_response(uuid, text, jsonb) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 9. Results (instructor only), API.md section 11
-- -----------------------------------------------------------------------------
-- Percentages are relative to the number of responses that answered the
-- question, rounded to one decimal place. SECURITY INVOKER: RLS applies, and
-- anon has no execute privilege anyway.

create or replace function public.get_survey_results(p_survey_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    with question_totals as (
        select q.id, q.question_text, q.question_type, q.position, q.created_at,
               (select count(*) from public.answers a
                 where a.question_id = q.id and a.choice_id is not null) as answered
          from public.questions q
         where q.survey_id = p_survey_id
    )
    select jsonb_build_object(
        'survey_id', p_survey_id,
        'response_count', (select count(*) from public.responses r where r.survey_id = p_survey_id),
        'questions', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'question_id', qt.id,
                    'question_text', qt.question_text,
                    'question_type', qt.question_type,
                    'position', qt.position,
                    'response_count', qt.answered,
                    'choices', coalesce((
                        select jsonb_agg(
                            jsonb_build_object(
                                'choice_id', c.id,
                                'choice_text', c.choice_text,
                                'count', cc.n,
                                'percentage', case when qt.answered = 0 then 0
                                                   else round(cc.n * 100.0 / qt.answered, 1) end
                            ) order by c.position, c.created_at
                        )
                        from public.choices c
                        cross join lateral (
                            select count(*) as n from public.answers a where a.choice_id = c.id
                        ) cc
                        where c.question_id = qt.id
                    ), '[]'::jsonb)
                ) order by qt.position, qt.created_at
            )
            from question_totals qt
        ), '[]'::jsonb)
    );
$$;

revoke execute on function public.get_survey_results(uuid) from public, anon;
grant execute on function public.get_survey_results(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 10. Save survey from the editor (instructor only), atomic
-- -----------------------------------------------------------------------------
-- p_questions: [{ "question_text", "question_type", "choices": [{ "choice_text" }] }]
-- Array order defines position (1-based). True/False questions always get the
-- choices True, False. Questions are replaced as a whole, which is safe
-- because editing is only allowed while a survey has no responses.
-- Pass p_survey_id = null to create a new draft. Returns the survey id.

create or replace function public.save_survey(
    p_survey_id uuid,
    p_title text,
    p_description text,
    p_questions jsonb
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_survey_id   uuid := p_survey_id;
    v_status      text;
    v_question    jsonb;
    v_choice      jsonb;
    v_question_id uuid;
    v_type        text;
    v_q_pos       integer := 0;
    v_c_pos       integer;
begin
    if p_title is null or length(btrim(p_title)) = 0 then
        raise exception 'TITLE_REQUIRED' using errcode = 'P0001';
    end if;
    if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
        raise exception 'INVALID_PAYLOAD' using errcode = 'P0001';
    end if;

    if v_survey_id is null then
        insert into public.surveys (title, description, status)
        values (btrim(p_title), nullif(btrim(p_description), ''), 'draft')
        returning id into v_survey_id;
    else
        select status into v_status from public.surveys where id = v_survey_id for update;
        if not found then
            raise exception 'SURVEY_NOT_FOUND' using errcode = 'P0001';
        end if;
        if v_status = 'active' then
            raise exception 'SURVEY_IS_ACTIVE' using errcode = 'P0001';
        end if;
        if exists (select 1 from public.responses where survey_id = v_survey_id) then
            raise exception 'SURVEY_HAS_RESPONSES' using errcode = 'P0001';
        end if;

        update public.surveys
           set title = btrim(p_title),
               description = nullif(btrim(p_description), '')
         where id = v_survey_id;

        delete from public.questions where survey_id = v_survey_id;
    end if;

    for v_question in select * from jsonb_array_elements(p_questions) loop
        v_q_pos := v_q_pos + 1;
        v_type := v_question ->> 'question_type';

        if coalesce(length(btrim(v_question ->> 'question_text')), 0) = 0 then
            raise exception 'QUESTION_TEXT_REQUIRED' using errcode = 'P0001';
        end if;
        if v_type is null or v_type not in ('multiple_choice', 'true_false') then
            raise exception 'INVALID_QUESTION_TYPE' using errcode = 'P0001';
        end if;

        insert into public.questions (survey_id, question_text, question_type, position)
        values (v_survey_id, btrim(v_question ->> 'question_text'), v_type, v_q_pos)
        returning id into v_question_id;

        if v_type = 'true_false' then
            insert into public.choices (question_id, choice_text, position)
            values (v_question_id, 'True', 1), (v_question_id, 'False', 2);
        else
            if jsonb_typeof(v_question -> 'choices') <> 'array'
               or jsonb_array_length(v_question -> 'choices') < 2 then
                raise exception 'NOT_ENOUGH_CHOICES' using errcode = 'P0001';
            end if;
            v_c_pos := 0;
            for v_choice in select * from jsonb_array_elements(v_question -> 'choices') loop
                v_c_pos := v_c_pos + 1;
                if coalesce(length(btrim(v_choice ->> 'choice_text')), 0) = 0 then
                    raise exception 'CHOICE_TEXT_REQUIRED' using errcode = 'P0001';
                end if;
                insert into public.choices (question_id, choice_text, position)
                values (v_question_id, btrim(v_choice ->> 'choice_text'), v_c_pos);
            end loop;
        end if;
    end loop;

    return v_survey_id;
end;
$$;

revoke execute on function public.save_survey(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_survey(uuid, text, text, jsonb) to authenticated;


-- -----------------------------------------------------------------------------
-- 11. Duplicate survey (instructor only), API.md section 6
-- -----------------------------------------------------------------------------
-- New Draft named "Copy of ...", copies questions and choices, never responses.

create or replace function public.duplicate_survey(p_survey_id uuid)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_source       public.surveys%rowtype;
    v_new_id       uuid;
    v_question     public.questions%rowtype;
    v_new_question uuid;
begin
    select * into v_source from public.surveys where id = p_survey_id;
    if not found then
        raise exception 'SURVEY_NOT_FOUND' using errcode = 'P0001';
    end if;

    insert into public.surveys (title, description, status)
    values ('Copy of ' || v_source.title, v_source.description, 'draft')
    returning id into v_new_id;

    for v_question in
        select * from public.questions where survey_id = p_survey_id order by position, created_at
    loop
        insert into public.questions (survey_id, question_text, question_type, position)
        values (v_new_id, v_question.question_text, v_question.question_type, v_question.position)
        returning id into v_new_question;

        insert into public.choices (question_id, choice_text, position)
        select v_new_question, c.choice_text, c.position
          from public.choices c
         where c.question_id = v_question.id
         order by c.position, c.created_at;
    end loop;

    return v_new_id;
end;
$$;

revoke execute on function public.duplicate_survey(uuid) from public, anon;
grant execute on function public.duplicate_survey(uuid) to authenticated;
