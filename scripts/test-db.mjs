// Database test suite for supabase/migrations/*.sql
//
// Runs the real migration inside PGlite (PostgreSQL compiled to WebAssembly),
// recreates Supabase's `anon` / `authenticated` roles and default grants, then
// checks the schema, Row Level Security and every RPC used by the app.
//
//   npm run test:db
//
// No Docker or Supabase account needed. The same SQL file is what you paste
// into the Supabase SQL Editor.

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'supabase', 'migrations')
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))

let passed = 0
let failed = 0

function check(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.log(`  FAIL ${name}${detail ? `  (${detail})` : ''}`)
  }
}

const db = new PGlite()

// --- Recreate the parts of a Supabase project the migration relies on --------
await db.exec(`
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase grants everything in "public" to these roles by default and relies
  -- on RLS. The migration must lock things down despite these defaults.
  alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`)

async function as(role, fn) {
  await db.exec(`set role ${role}`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}

async function q(sql, params = []) {
  return (await db.query(sql, params)).rows
}

async function one(sql, params = []) {
  const rows = await q(sql, params)
  return rows[0]
}

// Returns the error message, or null if the statement succeeded.
async function errorOf(sql, params = []) {
  try {
    await db.query(sql, params)
    return null
  } catch (e) {
    return e.message
  }
}

async function rpc(fn, args) {
  const keys = Object.keys(args)
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`
  const values = keys.map((k) =>
    args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k],
  )
  return (await one(sql, values)).r
}

async function rpcError(fn, args) {
  try {
    await rpc(fn, args)
    return null
  } catch (e) {
    return e.message
  }
}

// --- 1. Migration ---------------------------------------------------------------
console.log('\nMigration')
for (const sql of migrations) await db.exec(sql)
check('migration applies on a fresh database', true)
for (const sql of migrations) await db.exec(sql)
check('migration is re-runnable (idempotent)', true)

const tables = (
  await q(`select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1`)
).map((r) => `${r.tablename}:${r.rowsecurity}`)
check(
  'all five tables exist with RLS enabled',
  JSON.stringify(tables) ===
    JSON.stringify([
      'answers:true',
      'choices:true',
      'questions:true',
      'responses:true',
      'surveys:true',
    ]),
  tables.join(','),
)

const fks = (
  await q(`
    select tc.table_name || '.' || kcu.column_name || '->' || ccu.table_name || ' ' || rc.delete_rule as fk
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
    order by 1`)
).map((r) => r.fk)
check(
  'foreign keys and delete rules match DATABASE.md',
  JSON.stringify(fks) ===
    JSON.stringify([
      'answers.choice_id->choices SET NULL',
      'answers.question_id->questions CASCADE',
      'answers.response_id->responses CASCADE',
      'choices.question_id->questions CASCADE',
      'questions.survey_id->surveys CASCADE',
      'responses.survey_id->surveys CASCADE',
    ]),
  fks.join(', '),
)

check(
  'invalid status is rejected by check constraint',
  (await errorOf(`insert into surveys (title, status) values ('x', 'bogus')`))?.includes('check'),
)

// --- 2. Instructor creates surveys -------------------------------------------------
console.log('\nInstructor (authenticated) survey management')
const recursionQuestions = [
  {
    question_text: 'What is required for a recursive function?',
    question_type: 'multiple_choice',
    choices: [
      { choice_text: 'A base case' },
      { choice_text: 'A pointer' },
      { choice_text: 'A loop' },
      { choice_text: 'A compiler' },
    ],
  },
  {
    question_text: 'Every recursive function needs a stopping condition.',
    question_type: 'true_false',
    // ignored for true/false: the function always stores True, False
    choices: [{ choice_text: 'Yes' }],
  },
]

const surveyA = await as('authenticated', () =>
  rpc('save_survey', {
    p_survey_id: null,
    p_title: '  Recursion Concept Check ',
    p_description: 'Quick in-class survey',
    p_questions: recursionQuestions,
  }),
)
check('save_survey creates a survey and returns its id', typeof surveyA === 'string')

const storedA = await one(`select * from surveys where id = $1`, [surveyA])
check(
  'new survey is a trimmed Draft',
  storedA.status === 'draft' && storedA.title === 'Recursion Concept Check',
)
check('new survey has no public slug until activated', storedA.public_slug === null)

const loadQuestions = (surveyId) =>
  q(
    `select id, question_text, question_type, position from questions where survey_id = $1 order by position`,
    [surveyId],
  )
const loadChoices = (questionId) =>
  q(`select id, choice_text, position from choices where question_id = $1 order by position`, [
    questionId,
  ])
let qRows = await loadQuestions(surveyA)
check(
  'questions stored with positions 1..n',
  qRows.length === 2 && qRows[0].position === 1 && qRows[1].position === 2,
)
let [mcQ, tfQ] = qRows
let mcChoices = await loadChoices(mcQ.id)
let tfChoices = await loadChoices(tfQ.id)
check(
  'multiple choice options stored in order',
  mcChoices.map((c) => c.choice_text).join('|') === 'A base case|A pointer|A loop|A compiler',
)
check(
  'true/false question always gets True, False',
  tfChoices.map((c) => c.choice_text).join('|') === 'True|False',
)

check(
  'save_survey rejects a blank title',
  (
    await as('authenticated', () =>
      rpcError('save_survey', {
        p_survey_id: null,
        p_title: '  ',
        p_description: null,
        p_questions: [],
      }),
    )
  )?.includes('TITLE_REQUIRED'),
)
check(
  'save_survey rejects a multiple choice question with fewer than 2 choices',
  (
    await as('authenticated', () =>
      rpcError('save_survey', {
        p_survey_id: null,
        p_title: 'Bad',
        p_description: null,
        p_questions: [
          {
            question_text: 'Q',
            question_type: 'multiple_choice',
            choices: [{ choice_text: 'only' }],
          },
        ],
      }),
    )
  )?.includes('NOT_ENOUGH_CHOICES'),
)
check(
  'failed save leaves no partial survey behind (atomic)',
  (await one(`select count(*)::int as n from surveys where title = 'Bad'`)).n === 0,
)

// Edit the draft: reorder and change text
const editedId = await as('authenticated', () =>
  rpc('save_survey', {
    p_survey_id: surveyA,
    p_title: 'Recursion Concept Check',
    p_description: 'Quick in-class survey',
    p_questions: [recursionQuestions[0], recursionQuestions[1]],
  }),
)
check('save_survey updates an existing draft in place', editedId === surveyA)
const afterEdit = await one(`select updated_at > created_at as bumped from surveys where id = $1`, [
  surveyA,
])
check('updated_at trigger bumps the timestamp on update', afterEdit.bumped === true)
// Saving a draft replaces its questions (allowed only while it has no responses),
// so reload the ids used by the rest of the tests.
qRows = await loadQuestions(surveyA)
;[mcQ, tfQ] = qRows
mcChoices = await loadChoices(mcQ.id)
tfChoices = await loadChoices(tfQ.id)
check('edited draft still has both questions', qRows.length === 2 && mcChoices.length === 4)

const surveyB = await as('authenticated', () =>
  rpc('save_survey', {
    p_survey_id: null,
    p_title: 'Pointer Review',
    p_description: null,
    p_questions: [
      { question_text: 'Pointers store addresses.', question_type: 'true_false', choices: [] },
    ],
  }),
)
const emptySurvey = await as('authenticated', () =>
  rpc('save_survey', {
    p_survey_id: null,
    p_title: 'Empty draft',
    p_description: null,
    p_questions: [],
  }),
)
check(
  'activating a survey without questions is refused',
  (
    await as('authenticated', () => rpcError('activate_survey', { p_survey_id: emptySurvey }))
  )?.includes('SURVEY_HAS_NO_QUESTIONS'),
)

// --- 3. Anonymous access before activation -----------------------------------------
console.log('\nStudent (anon) access to drafts')
check(
  'anon cannot see draft surveys',
  (await as('anon', () => q(`select * from surveys`))).length === 0,
)
check(
  'anon cannot see draft questions',
  (await as('anon', () => q(`select * from questions`))).length === 0,
)
check(
  'anon cannot see draft choices',
  (await as('anon', () => q(`select * from choices`))).length === 0,
)
check(
  'get_public_survey hides drafts (not_found)',
  (await as('anon', () => rpc('get_public_survey', { p_slug: surveyA })))?.status === 'not_found',
)
check(
  'anon cannot create surveys',
  (await as('anon', () => errorOf(`insert into surveys (title) values ('hacked')`)))?.includes(
    'permission denied',
  ),
)
check(
  'anon cannot activate surveys',
  (await as('anon', () => rpcError('activate_survey', { p_survey_id: surveyA })))?.includes(
    'permission denied',
  ),
)
check(
  'anon cannot call save_survey',
  (
    await as('anon', () =>
      rpcError('save_survey', {
        p_survey_id: null,
        p_title: 'x',
        p_description: null,
        p_questions: [],
      }),
    )
  )?.includes('permission denied'),
)
check(
  'anon cannot duplicate surveys',
  (await as('anon', () => rpcError('duplicate_survey', { p_survey_id: surveyA })))?.includes(
    'permission denied',
  ),
)

// --- 4. Activation -------------------------------------------------------------------
console.log('\nActivation')
const activatedA = await as('authenticated', () => rpc('activate_survey', { p_survey_id: surveyA }))
check(
  'activate_survey returns status active',
  activatedA.status === 'active' && activatedA.id === surveyA,
)
check(
  'activate_survey generates an 8-character slug',
  /^[a-hjkmnp-z2-9]{8}$/.test(activatedA.public_slug),
  activatedA.public_slug,
)

const activatedB = await as('authenticated', () => rpc('activate_survey', { p_survey_id: surveyB }))
const statusA = (await one(`select status from surveys where id = $1`, [surveyA])).status
check(
  'activating another survey closes the previous one',
  statusA === 'closed' && activatedB.status === 'active',
)
check('slugs are unique per survey', activatedB.public_slug !== activatedA.public_slug)
check(
  'exactly one active survey',
  (await one(`select count(*)::int as n from surveys where status = 'active'`)).n === 1,
)
check(
  'database refuses a second active survey even without the RPC',
  (await errorOf(`update surveys set status = 'active' where id = $1`, [surveyA]))?.includes(
    'only_one_active_survey',
  ),
)

const reactivated = await as('authenticated', () =>
  rpc('activate_survey', { p_survey_id: surveyA }),
)
check('re-activating keeps the original slug', reactivated.public_slug === activatedA.public_slug)
const slugA = reactivated.public_slug
check(
  'survey B was closed automatically',
  (await one(`select status from surveys where id = $1`, [surveyB])).status === 'closed',
)

// --- 5. Anonymous access to the active survey --------------------------------------
console.log('\nStudent (anon) access to the active survey')
const anonSurveys = await as('anon', () => q(`select id, status from surveys`))
check('anon sees only the active survey', anonSurveys.length === 1 && anonSurveys[0].id === surveyA)
check(
  'anon can read the active survey questions',
  (await as('anon', () => q(`select * from questions`))).length === 2,
)
check(
  'anon can read the active survey choices',
  (await as('anon', () => q(`select * from choices`))).length === 6,
)

const publicSurvey = await as('anon', () => rpc('get_public_survey', { p_slug: slugA }))
check(
  'get_public_survey resolves the slug',
  publicSurvey.status === 'active' && publicSurvey.survey.id === surveyA,
)
check(
  'get_public_survey returns ordered questions with choices',
  publicSurvey.questions.length === 2 &&
    publicSurvey.questions[0].choices.length === 4 &&
    publicSurvey.questions[0].choices[0].choice_text === 'A base case' &&
    publicSurvey.questions[1].choices.map((c) => c.choice_text).join('|') === 'True|False',
)
check(
  'get_public_survey returns no response data',
  !JSON.stringify(publicSurvey).includes('response'),
)
check(
  'get_public_survey also accepts the survey UUID',
  (await as('anon', () => rpc('get_public_survey', { p_slug: surveyA }))).status === 'active',
)
check(
  'unknown slug is not_found',
  (await as('anon', () => rpc('get_public_survey', { p_slug: 'nope1234' }))).status === 'not_found',
)
check(
  'closed survey reports closed',
  (await as('anon', () => rpc('get_public_survey', { p_slug: activatedB.public_slug }))).status ===
    'closed',
)

check(
  'anon cannot modify the active survey',
  (
    await as('anon', () => errorOf(`update surveys set title = 'hacked' where id = $1`, [surveyA]))
  )?.includes('permission denied'),
)
check(
  'anon cannot delete questions',
  (await as('anon', () => errorOf(`delete from questions`)))?.includes('permission denied'),
)

// --- 6. Student submissions ------------------------------------------------------------
console.log('\nStudent submissions')
const goodAnswers = (mcIndex, tfIndex) => [
  { question_id: mcQ.id, choice_id: mcChoices[mcIndex].id },
  { question_id: tfQ.id, choice_id: tfChoices[tfIndex].id },
]

const submit = (token, answers, surveyId = surveyA) =>
  as('anon', () =>
    rpc('submit_survey_response', {
      p_survey_id: surveyId,
      p_anonymous_token: token,
      p_answers: answers,
    }),
  )
const submitError = (token, answers, surveyId = surveyA) =>
  as('anon', () =>
    rpcError('submit_survey_response', {
      p_survey_id: surveyId,
      p_anonymous_token: token,
      p_answers: answers,
    }),
  )

const first = await submit('student-1', goodAnswers(0, 0))
check('valid submission succeeds', first.success === true && typeof first.response_id === 'string')
check(
  'response and answers are stored',
  (await one(`select count(*)::int as n from answers where response_id = $1`, [first.response_id]))
    .n === 2,
)
check(
  'same browser token is rejected',
  (await submitError('student-1', goodAnswers(1, 1)))?.includes('DUPLICATE_RESPONSE'),
)
check(
  'missing answer is rejected',
  (await submitError('student-x', [goodAnswers(0, 0)[0]]))?.includes('MISSING_REQUIRED_ANSWER'),
)
check(
  'null choice is rejected',
  (
    await submitError('student-x', [{ question_id: mcQ.id, choice_id: null }, goodAnswers(0, 0)[1]])
  )?.includes('MISSING_REQUIRED_ANSWER'),
)
check(
  'choice from another question is rejected',
  (
    await submitError('student-x', [
      { question_id: mcQ.id, choice_id: tfChoices[0].id },
      goodAnswers(0, 0)[1],
    ])
  )?.includes('INVALID_CHOICE'),
)
const otherQ = (await one(`select id from questions where survey_id = $1`, [surveyB])).id
check(
  'question from another survey is rejected',
  (
    await submitError('student-x', [
      ...goodAnswers(0, 0),
      { question_id: otherQ, choice_id: tfChoices[0].id },
    ])
  )?.includes('INVALID_QUESTION'),
)
check(
  'malformed question id is rejected',
  (
    await submitError('student-x', [{ question_id: 'not-a-uuid', choice_id: mcChoices[0].id }])
  )?.includes('INVALID_QUESTION'),
)
check(
  'answering the same question twice is rejected',
  (await submitError('student-x', [...goodAnswers(0, 0), goodAnswers(1, 0)[0]]))?.includes(
    'INVALID_QUESTION',
  ),
)
check(
  'non-array payload is rejected',
  (await submitError('student-x', { a: 1 }))?.includes('INVALID_PAYLOAD'),
)
check(
  'submitting to a closed survey is rejected',
  (
    await submitError('student-x', [{ question_id: otherQ, choice_id: tfChoices[0].id }], surveyB)
  )?.includes('SURVEY_NOT_ACTIVE'),
)
check(
  'submitting to a draft survey is rejected',
  (await submitError('student-x', [], emptySurvey))?.includes('SURVEY_NOT_ACTIVE'),
)
check(
  'rejected submissions stored nothing',
  (await one(`select count(*)::int as n from responses where anonymous_token = 'student-x'`)).n ===
    0,
)

// More students: MC answers 0,0,0,1 ; TF answers T,T,F,T  (student-1 already: 0,T)
await submit('student-2', goodAnswers(0, 0))
await submit('student-3', goodAnswers(0, 1))
await submit('student-4', goodAnswers(1, 0))

console.log('\nStudents cannot read results')
check(
  'anon cannot read responses',
  (await as('anon', () => errorOf(`select * from responses`)))?.includes('permission denied'),
)
check(
  'anon cannot read answers',
  (await as('anon', () => errorOf(`select * from answers`)))?.includes('permission denied'),
)
check(
  'anon cannot insert responses directly',
  (
    await as('anon', () => errorOf(`insert into responses (survey_id) values ($1)`, [surveyA]))
  )?.includes('permission denied'),
)
check(
  'anon cannot call get_survey_results',
  (await as('anon', () => rpcError('get_survey_results', { p_survey_id: surveyA })))?.includes(
    'permission denied',
  ),
)

// --- 7. Results ---------------------------------------------------------------------------
console.log('\nResults')
const results = await as('authenticated', () => rpc('get_survey_results', { p_survey_id: surveyA }))
check('total response count', results.response_count === 4, String(results.response_count))
const mcResult = results.questions[0]
check('per-question response count', mcResult.response_count === 4)
check(
  'choice counts',
  mcResult.choices.map((c) => c.count).join(',') === '3,1,0,0',
  mcResult.choices.map((c) => c.count).join(','),
)
check(
  'choice percentages (1 decimal)',
  mcResult.choices.map((c) => c.percentage).join(',') === '75,25,0,0',
  mcResult.choices.map((c) => c.percentage).join(','),
)
const tfResult = results.questions[1]
check(
  'true/false counts and percentages',
  tfResult.choices.map((c) => `${c.choice_text}:${c.count}:${c.percentage}`).join(',') ===
    'True:3:75,False:1:25',
  tfResult.choices.map((c) => `${c.choice_text}:${c.count}:${c.percentage}`).join(','),
)
const emptyResults = await as('authenticated', () =>
  rpc('get_survey_results', { p_survey_id: surveyB }),
)
check(
  'survey with no responses reports 0 and 0%',
  emptyResults.response_count === 0 && emptyResults.questions[0].choices[0].percentage === 0,
)

// --- 8. Editing rules ---------------------------------------------------------------------
console.log('\nEditing rules')
check(
  'active survey cannot be edited',
  (
    await as('authenticated', () =>
      rpcError('save_survey', {
        p_survey_id: surveyA,
        p_title: 'x',
        p_description: null,
        p_questions: [],
      }),
    )
  )?.includes('SURVEY_IS_ACTIVE'),
)

// --- 9. Closing -----------------------------------------------------------------------------
console.log('\nClosing')
const closed = await as('authenticated', () => rpc('close_survey', { p_survey_id: surveyA }))
check('close_survey sets status closed', closed.status === 'closed')
check(
  'submissions fail immediately after closing',
  (await submitError('student-5', goodAnswers(0, 0)))?.includes('SURVEY_NOT_ACTIVE'),
)
check(
  'closed survey is hidden from anon table reads',
  (await as('anon', () => q(`select * from surveys`))).length === 0,
)
check(
  'closed survey with responses cannot be edited',
  (
    await as('authenticated', () =>
      rpcError('save_survey', {
        p_survey_id: surveyA,
        p_title: 'x',
        p_description: null,
        p_questions: [],
      }),
    )
  )?.includes('SURVEY_HAS_RESPONSES'),
)
check(
  'results stay available after closing',
  (await as('authenticated', () => rpc('get_survey_results', { p_survey_id: surveyA })))
    .response_count === 4,
)

// --- 10. Archive, duplicate, delete -----------------------------------------------------
console.log('\nArchive, duplicate, delete')
await as('authenticated', () =>
  q(`update surveys set status = 'archived' where id = $1`, [surveyA]),
)
check(
  'instructor can archive a survey',
  (await one(`select status from surveys where id = $1`, [surveyA])).status === 'archived',
)
check(
  'archived survey reports closed to students',
  (await as('anon', () => rpc('get_public_survey', { p_slug: slugA }))).status === 'closed',
)

const copyId = await as('authenticated', () => rpc('duplicate_survey', { p_survey_id: surveyA }))
const copy = await one(`select * from surveys where id = $1`, [copyId])
check(
  'duplicate is a Draft named "Copy of ..."',
  copy.status === 'draft' &&
    copy.title === 'Copy of Recursion Concept Check' &&
    copy.public_slug === null,
)
const copyQs = await q(
  `select id, question_text, position from questions where survey_id = $1 order by position`,
  [copyId],
)
check(
  'duplicate copies all questions',
  copyQs.length === 2 && copyQs[0].question_text === mcQ.question_text,
)
check(
  'duplicate copies all choices',
  (
    await one(`select count(*)::int as n from choices where question_id = any($1)`, [
      copyQs.map((x) => x.id),
    ])
  ).n === 6,
)
check(
  'duplicate copies no responses',
  (await one(`select count(*)::int as n from responses where survey_id = $1`, [copyId])).n === 0,
)

const instructorSees = await as('authenticated', () => q(`select count(*)::int as n from surveys`))
check(
  'instructor can read all surveys (A, B, empty draft, copy)',
  instructorSees[0].n === 4,
  String(instructorSees[0].n),
)
const instructorResponses = await as('authenticated', () =>
  q(`select count(*)::int as n from responses`),
)
check('instructor can read all responses', instructorResponses[0].n === 4)

await as('authenticated', () => q(`delete from surveys where id = $1`, [surveyA]))
const leftovers = await one(
  `
  select (select count(*) from questions where survey_id = $1)::int as q,
         (select count(*) from responses where survey_id = $1)::int as r,
         (select count(*) from choices where question_id = any($2))::int as c,
         (select count(*) from answers where question_id = any($3))::int as a`,
  [surveyA, [mcQ.id, tfQ.id], [mcQ.id, tfQ.id]],
)
check(
  'deleting a survey cascades to questions, choices, responses, answers',
  leftovers.q === 0 && leftovers.r === 0 && leftovers.c === 0 && leftovers.a === 0,
  JSON.stringify(leftovers),
)

console.log(`\n${passed} passed, ${failed} failed`)
await db.close()
process.exit(failed === 0 ? 0 : 1)
