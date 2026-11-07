import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { LoadingState } from '../components/ui/LoadingState'
import { getAnonymousToken, hasSubmitted, markSubmitted } from '../lib/anonymousToken'
import { getPublicSurvey, submitSurveyResponse } from '../lib/api'
import { classifyError, studentErrorMessage } from '../lib/errors'
import { useDocumentTitle } from '../lib/hooks'
import type { PublicQuestion, PublicSurveyResult } from '../lib/types'

type PageState =
  | { kind: 'loading' }
  | { kind: 'load_error'; message: string }
  | { kind: 'not_found' }
  | { kind: 'closed' }
  | { kind: 'already_submitted'; title?: string }
  | { kind: 'success'; title: string }
  | {
      kind: 'form'
      surveyId: string
      title: string
      description: string | null
      questions: PublicQuestion[]
    }

function toPageState(result: PublicSurveyResult): PageState {
  if (result.status === 'not_found') return { kind: 'not_found' }
  if (result.status === 'closed') return { kind: 'closed' }
  if (hasSubmitted(result.survey.id)) {
    return { kind: 'already_submitted', title: result.survey.title }
  }
  return {
    kind: 'form',
    surveyId: result.survey.id,
    title: result.survey.title,
    description: result.survey.description,
    questions: result.questions,
  }
}

/** Public survey at /s/:slug. No login, no menu, large touch targets (UI.md section 7). */
export default function StudentSurveyPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [showMissing, setShowMissing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const submittingRef = useRef(false)

  useDocumentTitle(
    state.kind === 'form' || state.kind === 'success' || state.kind === 'already_submitted'
      ? (state.title ?? 'Survey')
      : 'Survey',
  )

  const load = useCallback(async () => {
    try {
      setState(toPageState(await getPublicSurvey(slug)))
    } catch (err) {
      setState({ kind: 'load_error', message: studentErrorMessage(err) })
    }
  }, [slug])

  useEffect(() => {
    let cancelled = false
    getPublicSurvey(slug)
      .then((result) => {
        if (!cancelled) setState(toPageState(result))
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ kind: 'load_error', message: studentErrorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  if (state.kind === 'loading') return <LoadingState label="Loading survey..." fullPage />

  if (state.kind === 'load_error') {
    return (
      <Message title="Could not load the survey">
        <p>{state.message}</p>
        <Button
          variant="primary"
          size="lg"
          className="mt-6 w-full"
          onClick={() => {
            setState({ kind: 'loading' })
            void load()
          }}
        >
          Try again
        </Button>
      </Message>
    )
  }

  if (state.kind === 'not_found') {
    return (
      <Message title="Survey not found.">
        <p>Check the link or scan the QR code again.</p>
      </Message>
    )
  }

  if (state.kind === 'closed') {
    return <Message title="This survey is no longer accepting responses." />
  }

  if (state.kind === 'already_submitted') {
    return (
      <Message
        title="You have already submitted a response to this survey."
        heading={state.title}
      />
    )
  }

  if (state.kind === 'success') {
    return (
      <Message title="Thank you!" heading={state.title} tone="success">
        <p className="text-xl">Your response has been recorded.</p>
      </Message>
    )
  }

  const { surveyId, title, description, questions } = state
  const missing = questions.filter((q) => !answers[q.id])
  const answeredCount = questions.length - missing.length

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return // double-tap protection
    setSubmitError(null)

    if (missing.length > 0) {
      setShowMissing(true)
      const first = missing[0]
      const el = document.getElementById(`question-${first.id}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      document.querySelector<HTMLInputElement>(`input[name="q-${first.id}"]`)?.focus({
        preventScroll: true,
      })
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    try {
      await submitSurveyResponse(
        surveyId,
        getAnonymousToken(),
        questions.map((q) => ({ question_id: q.id, choice_id: answers[q.id] })),
      )
      markSubmitted(surveyId)
      setState({ kind: 'success', title })
      window.scrollTo({ top: 0 })
    } catch (err) {
      const kind = classifyError(err)
      if (kind === 'duplicate') {
        markSubmitted(surveyId)
        setState({ kind: 'already_submitted', title })
      } else if (kind === 'closed') {
        setState({ kind: 'closed' })
      } else {
        setSubmitError(studentErrorMessage(err))
      }
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">{title}</h1>
          {description && <p className="mt-2 text-lg text-slate-700">{description}</p>}
        </header>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-5">
          {questions.map((q, index) => {
            const isMissing = showMissing && !answers[q.id]
            const errorId = `question-${q.id}-error`
            return (
              <fieldset
                key={q.id}
                id={`question-${q.id}`}
                aria-describedby={isMissing ? errorId : undefined}
                className={`rounded-xl border bg-white p-4 sm:p-6 ${
                  isMissing ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200'
                }`}
              >
                <legend className="sr-only">
                  Question {index + 1}: {q.question_text}
                </legend>
                <p aria-hidden="true" className="text-lg font-semibold text-slate-900 sm:text-xl">
                  {index + 1}. {q.question_text}
                </p>
                {isMissing && (
                  <p id={errorId} className="mt-1 font-medium text-red-700">
                    Please choose an answer.
                  </p>
                )}
                <div className="mt-4 space-y-3">
                  {q.choices.map((c) => {
                    const checked = answers[q.id] === c.id
                    return (
                      <label
                        key={c.id}
                        className={`flex min-h-14 cursor-pointer items-center gap-4 rounded-lg border-2 px-4 py-3 text-lg transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-600 ${
                          checked
                            ? 'border-blue-700 bg-blue-50 font-medium text-slate-900'
                            : 'border-slate-200 bg-white text-slate-800 hover:border-slate-400'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          value={c.id}
                          checked={checked}
                          disabled={submitting}
                          onChange={() => setAnswers((a) => ({ ...a, [q.id]: c.id }))}
                          className="h-6 w-6 shrink-0 accent-blue-700"
                        />
                        <span>{c.choice_text}</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )
          })}

          {submitError && (
            <div
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900"
            >
              {submitError}
            </div>
          )}

          <div className="pt-2">
            <p className="mb-3 text-center text-slate-600" aria-live="polite">
              {answeredCount} of {questions.length} answered
            </p>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </div>
        </form>
      </div>
    </main>
  )
}

function Message({
  title,
  heading,
  tone = 'neutral',
  children,
}: {
  title: string
  heading?: string
  tone?: 'neutral' | 'success'
  children?: ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {heading && <p className="mb-4 text-slate-600">{heading}</p>}
        {tone === 'success' && (
          <div
            aria-hidden="true"
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-800"
          >
            ✓
          </div>
        )}
        <h1 className="text-2xl font-bold text-slate-900" role="status">
          {title}
        </h1>
        {children && <div className="mt-3 text-slate-700">{children}</div>}
      </div>
    </main>
  )
}
