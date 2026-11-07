-- Optional demo data: one Draft survey matching the examples in UI.md.
-- Runs automatically for the local Supabase stack (`supabase start` / `supabase db reset`).
-- On a hosted project you may paste it into the SQL Editor after the migration.
-- Safe to run more than once.

insert into public.surveys (id, title, description, status)
values ('00000000-0000-4000-8000-000000000001',
        'Recursion Concept Check',
        'Quick understanding check',
        'draft')
on conflict (id) do nothing;

insert into public.questions (id, survey_id, question_text, question_type, position)
values
    ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001',
     'What is required for a recursive function to stop?', 'multiple_choice', 1),
    ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001',
     'Every recursive function needs a stopping condition.', 'true_false', 2)
on conflict (id) do nothing;

insert into public.choices (id, question_id, choice_text, position)
values
    ('00000000-0000-4000-8000-000000001011', '00000000-0000-4000-8000-000000000101', 'A base case', 1),
    ('00000000-0000-4000-8000-000000001012', '00000000-0000-4000-8000-000000000101', 'A pointer', 2),
    ('00000000-0000-4000-8000-000000001013', '00000000-0000-4000-8000-000000000101', 'A loop', 3),
    ('00000000-0000-4000-8000-000000001014', '00000000-0000-4000-8000-000000000101', 'A compiler', 4),
    ('00000000-0000-4000-8000-000000001021', '00000000-0000-4000-8000-000000000102', 'True', 1),
    ('00000000-0000-4000-8000-000000001022', '00000000-0000-4000-8000-000000000102', 'False', 2)
on conflict (id) do nothing;
