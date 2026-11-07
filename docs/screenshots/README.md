# Database evidence (deliverable E)

Save the screenshots in this folder with these names. Do not include passwords, keys, or real
student information.

| File | What to capture |
|---|---|
| `01-supabase-tables.png` | Supabase **Table Editor** sidebar showing `surveys`, `questions`, `choices`, `responses`, `answers` (RLS enabled badges visible) |
| `02-survey-with-questions.png` | `surveys` row for a test survey, plus `questions` / `choices` filtered by that survey (or a SQL Editor query joining them, see below) |
| `03-stored-responses.png` | `responses` and `answers` rows after submitting from a phone |
| `04-results-in-app.png` | The app's Results page for the same survey (counts, percentages, chart) |
| `05-present-qr.png` *(optional)* | The Present page with the QR code |
| `06-rls-policies.png` *(optional)* | **Authentication → Policies** (or Database → Policies) listing the RLS policies |

Useful SQL Editor query for screenshot 2 (survey with its questions and choices):

```sql
select s.title, s.status, s.public_slug, q.position as q_pos, q.question_text, q.question_type,
       c.position as c_pos, c.choice_text
from surveys s
join questions q on q.survey_id = s.id
join choices c on c.question_id = q.id
order by s.created_at desc, q.position, c.position;
```

And for screenshot 3 (stored student responses):

```sql
select r.id as response_id, r.submitted_at, q.question_text, c.choice_text
from responses r
join answers a on a.response_id = r.id
join questions q on q.id = a.question_id
left join choices c on c.id = a.choice_id
order by r.submitted_at desc, q.position;
```
