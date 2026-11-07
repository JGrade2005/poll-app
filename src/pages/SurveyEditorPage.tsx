import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import { InstructorLayout } from '../components/layout/InstructorLayout'
import { Alert } from '../components/ui/Alert'
import { Button, LinkButton } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { LoadingState } from '../components/ui/LoadingState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useConfirm } from '../components/ui/useConfirm'
import {
  activateSurvey,
  closeSurvey,
  duplicateSurvey,
  getActiveSurvey,
  getResponseCount,
  getSurvey,
  saveSurvey,
} from '../lib/api'
import {
  editorStateFromSurvey,
  emptyEditorState,
  hasErrors,
  MAX_CHOICE_LENGTH,
  MAX_CHOICES,
  MAX_DESCRIPTION_LENGTH,
  MAX_QUESTION_LENGTH,
  MAX_TITLE_LENGTH,
  move,
  newChoice,
  newQuestion,
  snapshot,
  toQuestionInputs,
  validateEditor,
  type EditorErrors,
  type EditorQuestion,
  type EditorState,
} from '../lib/editorModel'
import { instructorErrorMessage } from '../lib/errors'
import { pluralize } from '../lib/format'
import { useDocumentTitle } from '../lib/hooks'
import type { SurveyWithQuestions } from '../lib/types'

type SaveState = 'idle' | 'saving' | 'activating'

const inputClass =
  'mt-1 w-full rounded-lg border px-3 py-2.5 text-base aria-[invalid=true]:border-red-600 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-red-600 border-slate-300'

function choiceLetter(index: number): string {
  return String.fromCharCode(65 + index)
}

export default function SurveyEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirm()

  const surveyId = id ?? null
  const [survey, setSurvey] = useState<SurveyWithQuestions | null>(null)
  const [responseCount, setResponseCount] = useState(0)
  const [loading, setLoading] = useState(Boolean(id))
  const [loadError, setLoadError] = useState<string | null>(null)

  const [form, setForm] = useState<EditorState>(() => emptyEditorState())
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    id ? '' : snapshot(emptyEditorState()),
  )
  // Errors are derived from the form once the user has tried to save, so they
  // update (and disappear) as fields are fixed.
  const [showErrors, setShowErrors] = useState(false)
  const [validateForActivation, setValidateForActivation] = useState(false)
  const errors: EditorErrors | null = showErrors
    ? validateEditor(form, validateForActivation)
    : null
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [serverError, setServerError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const dirty = !loading && !loadError && snapshot(form) !== savedSnapshot
  const locked = survey !== null && (survey.status === 'active' || responseCount > 0)
  const busy = saveState !== 'idle'

  useDocumentTitle(surveyId ? `Edit: ${form.title || 'Survey'}` : 'New Survey')

  // Moves keyboard focus to a field once React has rendered it (new question,
  // new choice, first invalid field). A state change guarantees a render, and the
  // effect runs right after commit, unlike requestAnimationFrame, which browsers
  // pause in background tabs.
  const [focusRequest, setFocusRequest] = useState<{ id: string; seq: number } | null>(null)
  const focusField = (fieldId: string) =>
    setFocusRequest((prev) => ({ id: fieldId, seq: (prev?.seq ?? 0) + 1 }))
  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.id)?.focus()
  }, [focusRequest])

  // ---- Load an existing survey ------------------------------------------------
  const load = useCallback(async (surveyIdToLoad: string) => {
    setLoading(true)
    setLoadError(null)
    try {
      const [loaded, count] = await Promise.all([
        getSurvey(surveyIdToLoad),
        getResponseCount(surveyIdToLoad),
      ])
      const state = editorStateFromSurvey(loaded)
      setSurvey(loaded)
      setResponseCount(count)
      setForm(state)
      setSavedSnapshot(snapshot(state))
      setShowErrors(false)
    } catch (err) {
      setLoadError(instructorErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // After "Save Draft" on a new survey the URL changes to /surveys/<id>/edit;
  // the form already holds that data, so skip reloading it.
  const skipLoadFor = useRef<string | null>(null)

  useEffect(() => {
    if (id && id !== skipLoadFor.current) void load(id)
  }, [id, load])

  // ---- Unsaved-changes protection ----------------------------------------------
  const allowNavigation = useRef(false)
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !allowNavigation.current &&
      dirtyRef.current &&
      currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // ---- Form updates ----------------------------------------------------------------
  function updateQuestion(key: string, patch: Partial<EditorQuestion>) {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q) => (q.key === key ? { ...q, ...patch } : q)),
    }))
  }

  function updateChoice(questionKey: string, choiceKey: string, text: string) {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q) =>
        q.key === questionKey
          ? {
              ...q,
              choices: q.choices.map((c) =>
                c.key === choiceKey ? { ...c, choice_text: text } : c,
              ),
            }
          : q,
      ),
    }))
  }

  function addQuestion() {
    const question = newQuestion()
    setForm((f) => ({ ...f, questions: [...f.questions, question] }))
    focusField(`q-${question.key}-text`)
  }

  async function removeQuestion(question: EditorQuestion, index: number) {
    const hasContent =
      question.question_text.trim() !== '' ||
      question.choices.some((c) => c.choice_text.trim() !== '')
    if (hasContent) {
      const ok = await confirm({
        title: `Delete question ${index + 1}?`,
        body: question.question_text.trim() ? <p>"{question.question_text.trim()}"</p> : undefined,
        confirmLabel: 'Delete Question',
      })
      if (!ok) return
    }
    setForm((f) => ({ ...f, questions: f.questions.filter((q) => q.key !== question.key) }))
  }

  function moveQuestion(index: number, delta: number) {
    setForm((f) => ({ ...f, questions: move(f.questions, index, delta) }))
  }

  function addChoice(questionKey: string) {
    const choice = newChoice()
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q) =>
        q.key === questionKey ? { ...q, choices: [...q.choices, choice] } : q,
      ),
    }))
    focusField(`q-${questionKey}-choice-${choice.key}`)
  }

  function removeChoice(questionKey: string, choiceKey: string) {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q) =>
        q.key === questionKey ? { ...q, choices: q.choices.filter((c) => c.key !== choiceKey) } : q,
      ),
    }))
  }

  function moveChoice(questionKey: string, index: number, delta: number) {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q) =>
        q.key === questionKey ? { ...q, choices: move(q.choices, index, delta) } : q,
      ),
    }))
  }

  // ---- Save / activate ---------------------------------------------------------------
  function focusFirstError(result: EditorErrors) {
    let targetId: string | null = null
    if (result.title) targetId = 'title'
    else if (result.questions) targetId = 'add-question'
    else {
      for (const q of form.questions) {
        const qe = result.byQuestion[q.key]
        if (!qe) continue
        if (qe.question_text) targetId = `q-${q.key}-text`
        else if (qe.choiceItems) targetId = `q-${q.key}-choice-${Object.keys(qe.choiceItems)[0]}`
        else targetId = `q-${q.key}-add-choice`
        break
      }
    }
    if (targetId) focusField(targetId)
  }

  async function persist(): Promise<string> {
    const savedId = await saveSurvey(
      surveyId,
      form.title.trim(),
      form.description.trim(),
      toQuestionInputs(form),
    )
    setSavedSnapshot(snapshot(form))
    setSavedAt(new Date())
    return savedId
  }

  async function handleSave(e?: FormEvent) {
    e?.preventDefault()
    if (busy) return
    setServerError(null)
    setValidateForActivation(false)
    const result = validateEditor(form, false)
    setShowErrors(true)
    if (hasErrors(result)) {
      focusFirstError(result)
      return
    }

    setSaveState('saving')
    try {
      const savedId = await persist()
      if (!surveyId) {
        skipLoadFor.current = savedId
        setSurvey({
          id: savedId,
          title: form.title.trim(),
          description: form.description.trim() || null,
          status: 'draft',
          public_slug: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          questions: [],
        })
        allowNavigation.current = true
        navigate(`/surveys/${savedId}/edit`, { replace: true })
        allowNavigation.current = false
      }
      setShowErrors(false)
    } catch (err) {
      setServerError(instructorErrorMessage(err))
    } finally {
      setSaveState('idle')
    }
  }

  async function handleActivate() {
    if (busy) return
    setServerError(null)
    setValidateForActivation(true)
    const result = validateEditor(form, true)
    setShowErrors(true)
    if (hasErrors(result)) {
      focusFirstError(result)
      return
    }

    setSaveState('activating')
    try {
      const current = await getActiveSurvey()
      if (current && current.id !== surveyId) {
        const ok = await confirm({
          title: 'Activate this survey?',
          body: (
            <p>
              Only one survey can be active. <strong>"{current.title}"</strong> will be closed and
              stop accepting responses.
            </p>
          ),
          confirmLabel: 'Activate',
          tone: 'primary',
        })
        if (!ok) return
      }
      const savedId = await persist()
      await activateSurvey(savedId)
      allowNavigation.current = true
      navigate(`/surveys/${savedId}/present`)
    } catch (err) {
      setServerError(instructorErrorMessage(err))
    } finally {
      setSaveState('idle')
    }
  }

  async function handleCloseActive() {
    if (!survey) return
    const ok = await confirm({
      title: `Close "${survey.title}"?`,
      body: <p>Students will no longer be able to submit responses.</p>,
      confirmLabel: 'Close Survey',
    })
    if (!ok) return
    setSaveState('saving')
    try {
      await closeSurvey(survey.id)
      await load(survey.id)
    } catch (err) {
      setServerError(instructorErrorMessage(err))
    } finally {
      setSaveState('idle')
    }
  }

  async function handleDuplicate() {
    if (!survey) return
    setSaveState('saving')
    try {
      const newId = await duplicateSurvey(survey.id)
      allowNavigation.current = true
      navigate(`/surveys/${newId}/edit`)
      allowNavigation.current = false
    } catch (err) {
      setServerError(instructorErrorMessage(err))
    } finally {
      setSaveState('idle')
    }
  }

  // ---- Render ---------------------------------------------------------------------
  const pageTitle = surveyId ? 'Edit Survey' : 'New Survey'

  if (loading) {
    return (
      <InstructorLayout title={pageTitle}>
        <LoadingState label="Loading survey..." />
      </InstructorLayout>
    )
  }

  if (loadError) {
    return (
      <InstructorLayout title={pageTitle}>
        <Alert tone="error" title="Could not load this survey">
          <p>{loadError}</p>
          <div className="mt-3 flex gap-2">
            {id && (
              <Button size="sm" onClick={() => void load(id)}>
                Try again
              </Button>
            )}
            <LinkButton size="sm" to="/dashboard">
              Back to Dashboard
            </LinkButton>
          </div>
        </Alert>
      </InstructorLayout>
    )
  }

  if (locked && survey) {
    return (
      <InstructorLayout
        title={survey.title}
        actions={
          <LinkButton to="/dashboard" size="sm">
            Back to Dashboard
          </LinkButton>
        }
      >
        {dialog}
        {serverError && (
          <Alert tone="error" className="mb-4">
            {serverError}
          </Alert>
        )}
        {survey.status === 'active' ? (
          <Alert tone="warning" title="This survey is active">
            <p>Close the survey before editing it, so students do not see questions change.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <LinkButton size="sm" variant="primary" to={`/surveys/${survey.id}/present`}>
                Present QR
              </LinkButton>
              <Button size="sm" onClick={() => void handleCloseActive()} disabled={busy}>
                Close Survey
              </Button>
            </div>
          </Alert>
        ) : (
          <Alert tone="warning" title="This survey already has responses">
            <p>
              It has {pluralize(responseCount, 'response')}, so its questions cannot be changed
              without corrupting the results. Duplicate it to make a new editable version.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => void handleDuplicate()}
                disabled={busy}
              >
                Duplicate
              </Button>
              <LinkButton size="sm" to={`/surveys/${survey.id}/results`}>
                View Results
              </LinkButton>
            </div>
          </Alert>
        )}

        <section aria-label="Questions" className="mt-6 space-y-4">
          {survey.description && <p className="text-slate-700">{survey.description}</p>}
          {survey.questions.map((q, i) => (
            <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="font-semibold text-slate-900">
                {i + 1}. {q.question_text}
              </p>
              <ul className="mt-2 list-disc pl-6 text-slate-700">
                {q.choices.map((c) => (
                  <li key={c.id}>{c.choice_text}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </InstructorLayout>
    )
  }

  return (
    <InstructorLayout
      title={pageTitle}
      actions={
        <>
          {survey && <StatusBadge status={survey.status} />}
          <LinkButton to="/dashboard" size="sm">
            Back to Dashboard
          </LinkButton>
        </>
      }
    >
      {dialog}
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Leave without saving?"
        body={<p>You have unsaved changes to this survey. They will be lost.</p>}
        confirmLabel="Leave"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />

      <form onSubmit={(e) => void handleSave(e)} noValidate className="space-y-6">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div>
            <label htmlFor="title" className="block font-medium text-slate-900">
              Survey Title <span className="text-red-700">*</span>
            </label>
            <input
              id="title"
              value={form.title}
              maxLength={MAX_TITLE_LENGTH}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              aria-invalid={Boolean(errors?.title)}
              aria-describedby={errors?.title ? 'title-error' : undefined}
              placeholder="e.g. Recursion Concept Check"
              className={inputClass}
            />
            {errors?.title && (
              <p id="title-error" className="mt-1 text-sm font-medium text-red-700">
                {errors.title}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="description" className="block font-medium text-slate-900">
              Description <span className="font-normal text-slate-600">(optional)</span>
            </label>
            <textarea
              id="description"
              rows={2}
              value={form.description}
              maxLength={MAX_DESCRIPTION_LENGTH}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Shown to students above the questions"
              className={inputClass}
            />
          </div>
        </section>

        {form.questions.length === 0 && (
          <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-8 text-center text-slate-700">
            No questions yet. Add one below.
          </p>
        )}

        <ol className="space-y-5">
          {form.questions.map((question, index) => (
            <QuestionCard
              key={question.key}
              question={question}
              index={index}
              total={form.questions.length}
              errors={errors?.byQuestion[question.key]}
              onChange={(patch) => updateQuestion(question.key, patch)}
              onChoiceChange={(choiceKey, text) => updateChoice(question.key, choiceKey, text)}
              onAddChoice={() => addChoice(question.key)}
              onRemoveChoice={(choiceKey) => removeChoice(question.key, choiceKey)}
              onMoveChoice={(choiceIndex, delta) => moveChoice(question.key, choiceIndex, delta)}
              onMove={(delta) => moveQuestion(index, delta)}
              onRemove={() => void removeQuestion(question, index)}
            />
          ))}
        </ol>

        <div>
          <Button id="add-question" onClick={addQuestion} className="w-full sm:w-auto">
            + Add Question
          </Button>
          {errors?.questions && (
            <p className="mt-2 text-sm font-medium text-red-700">{errors.questions}</p>
          )}
        </div>

        {serverError && <Alert tone="error">{serverError}</Alert>}
        {errors && hasErrors(errors) && (
          <Alert tone="error">Please fix the highlighted fields before saving.</Alert>
        )}

        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-white">
          <Button type="submit" disabled={busy}>
            {saveState === 'saving' ? 'Saving...' : 'Save Draft'}
          </Button>
          <Button variant="primary" onClick={() => void handleActivate()} disabled={busy}>
            {saveState === 'activating' ? 'Activating...' : 'Activate'}
          </Button>
          <span className="text-sm text-slate-600" role="status" aria-live="polite">
            {saveState === 'saving'
              ? 'Saving...'
              : dirty
                ? 'Unsaved changes'
                : savedAt
                  ? `Saved at ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                  : surveyId
                    ? 'All changes saved'
                    : ''}
          </span>
        </div>
      </form>
    </InstructorLayout>
  )
}

// ---------------------------------------------------------------------------------

interface QuestionCardProps {
  question: EditorQuestion
  index: number
  total: number
  errors?: EditorErrors['byQuestion'][string]
  onChange: (patch: Partial<EditorQuestion>) => void
  onChoiceChange: (choiceKey: string, text: string) => void
  onAddChoice: () => void
  onRemoveChoice: (choiceKey: string) => void
  onMoveChoice: (index: number, delta: number) => void
  onMove: (delta: number) => void
  onRemove: () => void
}

function QuestionCard({
  question,
  index,
  total,
  errors,
  onChange,
  onChoiceChange,
  onAddChoice,
  onRemoveChoice,
  onMoveChoice,
  onMove,
  onRemove,
}: QuestionCardProps) {
  const number = index + 1
  const textId = `q-${question.key}-text`
  const typeId = `q-${question.key}-type`
  const headingId = `q-${question.key}-heading`

  return (
    <li
      aria-labelledby={headingId}
      className={`rounded-xl border bg-white p-5 sm:p-6 ${
        errors ? 'border-red-300' : 'border-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-lg font-semibold text-slate-900">
          Question {number}
        </h2>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Move question ${number} up`}
          >
            ↑ Up
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Move question ${number} down`}
          >
            ↓ Down
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor={textId} className="block font-medium text-slate-800">
          Question text <span className="text-red-700">*</span>
        </label>
        <textarea
          id={textId}
          rows={2}
          value={question.question_text}
          maxLength={MAX_QUESTION_LENGTH}
          onChange={(e) => onChange({ question_text: e.target.value })}
          aria-invalid={Boolean(errors?.question_text)}
          aria-describedby={errors?.question_text ? `${textId}-error` : undefined}
          placeholder="e.g. What is required for a recursive function?"
          className={inputClass}
        />
        {errors?.question_text && (
          <p id={`${textId}-error`} className="mt-1 text-sm font-medium text-red-700">
            {errors.question_text}
          </p>
        )}
      </div>

      <div className="mt-4 max-w-xs">
        <label htmlFor={typeId} className="block font-medium text-slate-800">
          Type
        </label>
        <select
          id={typeId}
          value={question.question_type}
          onChange={(e) =>
            onChange({ question_type: e.target.value as EditorQuestion['question_type'] })
          }
          className={`${inputClass} bg-white`}
        >
          <option value="multiple_choice">Multiple Choice</option>
          <option value="true_false">True / False</option>
        </select>
      </div>

      <fieldset className="mt-4">
        <legend className="font-medium text-slate-800">Choices</legend>

        {question.question_type === 'true_false' ? (
          <div className="mt-2">
            <div className="flex gap-2">
              <span className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2">True</span>
              <span className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2">
                False
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              True / False questions always use these two answers.
            </p>
          </div>
        ) : (
          <>
            <ul className="mt-2 space-y-2">
              {question.choices.map((choice, choiceIndex) => {
                const choiceId = `q-${question.key}-choice-${choice.key}`
                const choiceError = errors?.choiceItems?.[choice.key]
                const letter = choiceLetter(choiceIndex)
                return (
                  <li key={choice.key}>
                    <div className="flex items-center gap-1 sm:gap-2">
                      <label
                        htmlFor={choiceId}
                        className="w-6 shrink-0 text-center font-medium text-slate-600"
                      >
                        <span className="sr-only">Question {number} choice </span>
                        {letter}
                      </label>
                      <input
                        id={choiceId}
                        value={choice.choice_text}
                        maxLength={MAX_CHOICE_LENGTH}
                        onChange={(e) => onChoiceChange(choice.key, e.target.value)}
                        aria-invalid={Boolean(choiceError)}
                        aria-describedby={choiceError ? `${choiceId}-error` : undefined}
                        placeholder={`Choice ${letter}`}
                        className={`${inputClass} mt-0 min-w-0 flex-1`}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onMoveChoice(choiceIndex, -1)}
                        disabled={choiceIndex === 0}
                        aria-label={`Move choice ${letter} up`}
                        className="px-2"
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onMoveChoice(choiceIndex, 1)}
                        disabled={choiceIndex === question.choices.length - 1}
                        aria-label={`Move choice ${letter} down`}
                        className="px-2"
                      >
                        ↓
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onRemoveChoice(choice.key)}
                        aria-label={`Delete choice ${letter}`}
                        className="px-2 text-red-700"
                      >
                        ✕
                      </Button>
                    </div>
                    {choiceError && (
                      <p
                        id={`${choiceId}-error`}
                        className="ml-7 mt-1 text-sm font-medium text-red-700 sm:ml-8"
                      >
                        {choiceError}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
            <Button
              id={`q-${question.key}-add-choice`}
              size="sm"
              className="mt-3"
              onClick={onAddChoice}
              disabled={question.choices.length >= MAX_CHOICES}
            >
              + Add Choice
            </Button>
            {question.choices.length >= MAX_CHOICES && (
              <p className="mt-1 text-sm text-slate-600">Maximum of {MAX_CHOICES} choices.</p>
            )}
            {errors?.choices && (
              <p className="mt-2 text-sm font-medium text-red-700">{errors.choices}</p>
            )}
          </>
        )}
      </fieldset>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <Button size="sm" variant="ghost" onClick={onRemove} className="text-red-700">
          Delete Question
        </Button>
      </div>
    </li>
  )
}
