import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { InstructorLayout } from '../components/layout/InstructorLayout'
import { ResultsChart } from '../components/ResultsChart'
import { Alert } from '../components/ui/Alert'
import { Button, LinkButton } from '../components/ui/Button'
import { LoadingState } from '../components/ui/LoadingState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { getExportData, getSurvey, getSurveyResults } from '../lib/api'
import { buildResponsesCsv, buildSummaryCsv, downloadCsv } from '../lib/csv'
import { instructorErrorMessage } from '../lib/errors'
import { formatDate, pluralize, slugify } from '../lib/format'
import { useDocumentTitle, useInterval } from '../lib/hooks'
import type { QuestionResult, SurveyResults, SurveyWithQuestions } from '../lib/types'

const LIVE_REFRESH_MS = 5000

/** Local calendar date, YYYY-MM-DD, for export file names. */
function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function ResultsPage() {
  const { id = '' } = useParams<{ id: string }>()

  const [survey, setSurvey] = useState<SurveyWithQuestions | null>(null)
  const [results, setResults] = useState<SurveyResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState<'responses' | 'summary' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  useDocumentTitle(survey ? `Results: ${survey.title}` : 'Results')

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const [s, r] = await Promise.all([getSurvey(id), getSurveyResults(id)])
      setSurvey(s)
      setResults(r)
      setUpdatedAt(new Date())
      setError(null)
    } catch (err) {
      setError(instructorErrorMessage(err))
    } finally {
      setRefreshing(false)
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    Promise.all([getSurvey(id), getSurveyResults(id)])
      .then(([s, r]) => {
        if (cancelled) return
        setSurvey(s)
        setResults(r)
        setUpdatedAt(new Date())
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(instructorErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const isActive = survey?.status === 'active'

  // Live-ish updates while students are answering.
  useInterval(
    () => {
      getSurveyResults(id)
        .then((r) => {
          setResults(r)
          setUpdatedAt(new Date())
        })
        .catch(() => {
          /* keep showing the last results */
        })
    },
    LIVE_REFRESH_MS,
    isActive,
  )

  async function exportResponses() {
    if (!survey) return
    setExporting('responses')
    setExportError(null)
    try {
      const data = await getExportData(survey.id)
      downloadCsv(`${slugify(survey.title)}-responses-${today()}.csv`, buildResponsesCsv(data))
    } catch (err) {
      setExportError(instructorErrorMessage(err))
    } finally {
      setExporting(null)
    }
  }

  async function exportSummary() {
    if (!survey) return
    setExporting('summary')
    setExportError(null)
    try {
      const fresh = await getSurveyResults(survey.id)
      downloadCsv(`${slugify(survey.title)}-summary-${today()}.csv`, buildSummaryCsv(survey, fresh))
    } catch (err) {
      setExportError(instructorErrorMessage(err))
    } finally {
      setExporting(null)
    }
  }

  if (error && !survey) {
    return (
      <InstructorLayout title="Results">
        <Alert tone="error" title="Could not load results">
          <p>{error}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => void load()}>
              Try again
            </Button>
            <LinkButton size="sm" to="/dashboard">
              Back to Dashboard
            </LinkButton>
          </div>
        </Alert>
      </InstructorLayout>
    )
  }

  if (!survey || !results) {
    return (
      <InstructorLayout title="Results">
        <LoadingState label="Loading results..." />
      </InstructorLayout>
    )
  }

  const total = results.response_count

  return (
    <InstructorLayout>
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{survey.title}</h1>
          <StatusBadge status={survey.status} />
        </div>
        <p className="mt-2 text-xl text-slate-800" aria-live="polite">
          <span className="font-semibold tabular-nums">{total}</span>{' '}
          {total === 1 ? 'response' : 'responses'}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Created {formatDate(survey.created_at)}
          {updatedAt &&
            ` · Updated ${updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`}
          {isActive && ' · Updates automatically every 5 seconds'}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Button onClick={() => void load()} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
        <Button onClick={() => void exportResponses()} disabled={exporting !== null || total === 0}>
          {exporting === 'responses' ? 'Exporting...' : 'Export CSV'}
        </Button>
        <Button onClick={() => void exportSummary()} disabled={exporting !== null}>
          {exporting === 'summary' ? 'Exporting...' : 'Export Summary CSV'}
        </Button>
        {isActive && (
          <LinkButton to={`/surveys/${survey.id}/present`} variant="primary">
            Present QR
          </LinkButton>
        )}
        <LinkButton to="/dashboard" variant="ghost">
          Back to Dashboard
        </LinkButton>
      </div>

      {error && (
        <Alert tone="error" className="mb-4">
          Refresh failed: {error}
        </Alert>
      )}
      {exportError && (
        <Alert tone="error" className="mb-4">
          Export failed: {exportError}
        </Alert>
      )}

      {total === 0 && (
        <div className="mb-6 rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="text-lg font-medium text-slate-800">No responses yet.</p>
          <p className="mt-1 text-slate-600">Display the QR code so students can join.</p>
          {isActive && (
            <LinkButton to={`/surveys/${survey.id}/present`} variant="primary" className="mt-4">
              Present QR
            </LinkButton>
          )}
        </div>
      )}

      {results.questions.length === 0 ? (
        <p className="text-slate-700">This survey has no questions.</p>
      ) : (
        <ol className="space-y-6">
          {results.questions.map((q, i) => (
            <QuestionResultCard key={q.question_id} question={q} number={i + 1} total={total} />
          ))}
        </ol>
      )}
    </InstructorLayout>
  )
}

function QuestionResultCard({
  question,
  number,
  total,
}: {
  question: QuestionResult
  number: number
  total: number
}) {
  const unanswered = Math.max(0, total - question.response_count)
  const headingId = `result-q-${question.question_id}`

  return (
    <li
      aria-labelledby={headingId}
      className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
    >
      <h2 id={headingId} className="text-lg font-semibold text-slate-900">
        {number}. {question.question_text}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        {question.question_type === 'true_false' ? 'True / False' : 'Multiple Choice'} ·{' '}
        {pluralize(question.response_count, 'answer')}
        {unanswered > 0 && (
          <span className="font-medium text-amber-800"> · {unanswered} unanswered</span>
        )}
      </p>

      {question.response_count === 0 ? (
        <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-slate-700">
          Unanswered: no responses to this question yet.
        </p>
      ) : (
        <div className="mt-4">
          <ResultsChart choices={question.choices} label={question.question_text} />
        </div>
      )}

      <table className="mt-4 w-full text-left text-sm sm:text-base">
        <caption className="sr-only">Answer counts for question {number}</caption>
        <thead>
          <tr className="border-b border-slate-200 text-slate-600">
            <th scope="col" className="py-2 pr-3 font-medium">
              Choice
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Count
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Percent
            </th>
          </tr>
        </thead>
        <tbody>
          {question.choices.map((c, i) => (
            <tr key={c.choice_id} className="border-b border-slate-100 last:border-0">
              <th scope="row" className="py-2 pr-3 font-normal text-slate-800">
                <span className="mr-2 font-medium text-slate-500">
                  {String.fromCharCode(65 + i)}.
                </span>
                {c.choice_text}
              </th>
              <td className="py-2 pr-3 text-right font-semibold tabular-nums">{c.count}</td>
              <td className="py-2 text-right tabular-nums">{c.percentage}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </li>
  )
}
