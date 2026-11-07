import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { InstructorLayout } from '../components/layout/InstructorLayout'
import { Alert } from '../components/ui/Alert'
import { Button, LinkButton } from '../components/ui/Button'
import { LoadingState } from '../components/ui/LoadingState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useConfirm } from '../components/ui/useConfirm'
import {
  activateSurvey,
  closeSurvey,
  deleteSurvey,
  duplicateSurvey,
  listSurveys,
  setSurveyStatus,
} from '../lib/api'
import { instructorErrorMessage } from '../lib/errors'
import { formatDate, pluralize, STATUS_LABELS } from '../lib/format'
import { useDocumentTitle } from '../lib/hooks'
import { SURVEY_STATUSES, type SurveyListItem, type SurveyStatus } from '../lib/types'

type StatusFilter = 'all' | SurveyStatus

export default function DashboardPage() {
  useDocumentTitle('Dashboard')
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirm()

  const [surveys, setSurveys] = useState<SurveyListItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      setSurveys(await listSurveys())
    } catch (err) {
      setLoadError(instructorErrorMessage(err))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    listSurveys()
      .then((rows) => {
        if (!cancelled) setSurveys(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(instructorErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const activeSurvey = surveys?.find((s) => s.status === 'active') ?? null

  const filtered = useMemo(() => {
    if (!surveys) return []
    const term = search.trim().toLowerCase()
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null
    const to = toDate ? new Date(`${toDate}T23:59:59.999`) : null
    return surveys.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      if (term && !s.title.toLowerCase().includes(term)) return false
      const created = new Date(s.created_at)
      if (from && created < from) return false
      if (to && created > to) return false
      return true
    })
  }, [surveys, search, statusFilter, fromDate, toDate])

  const filtersActive = search !== '' || statusFilter !== 'all' || fromDate !== '' || toDate !== ''

  async function run(surveyId: string, action: () => Promise<void>) {
    setActionError(null)
    setBusyId(surveyId)
    try {
      await action()
    } catch (err) {
      setActionError(instructorErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  async function handleActivate(survey: SurveyListItem) {
    if (activeSurvey && activeSurvey.id !== survey.id) {
      const ok = await confirm({
        title: `Activate "${survey.title}"?`,
        body: (
          <p>
            Only one survey can be active. <strong>"{activeSurvey.title}"</strong> will be closed
            and stop accepting responses.
          </p>
        ),
        confirmLabel: 'Activate',
        tone: 'primary',
      })
      if (!ok) return
    }
    await run(survey.id, async () => {
      await activateSurvey(survey.id)
      navigate(`/surveys/${survey.id}/present`)
    })
  }

  async function handleClose(survey: SurveyListItem) {
    const ok = await confirm({
      title: `Close "${survey.title}"?`,
      body: <p>Students will no longer be able to submit responses. Results are kept.</p>,
      confirmLabel: 'Close Survey',
    })
    if (!ok) return
    await run(survey.id, async () => {
      await closeSurvey(survey.id)
      await load()
    })
  }

  async function handleArchive(survey: SurveyListItem) {
    const ok = await confirm({
      title: `Archive "${survey.title}"?`,
      body: (
        <p>Archived surveys keep all their responses and can still be viewed and restored later.</p>
      ),
      confirmLabel: 'Archive',
      tone: 'primary',
    })
    if (!ok) return
    await run(survey.id, async () => {
      await setSurveyStatus(survey.id, 'archived')
      await load()
    })
  }

  async function handleRestore(survey: SurveyListItem) {
    await run(survey.id, async () => {
      await setSurveyStatus(survey.id, survey.public_slug ? 'closed' : 'draft')
      await load()
    })
  }

  async function handleDuplicate(survey: SurveyListItem) {
    await run(survey.id, async () => {
      const newId = await duplicateSurvey(survey.id)
      navigate(`/surveys/${newId}/edit`)
    })
  }

  async function handleDelete(survey: SurveyListItem) {
    const hasResponses = survey.response_count > 0
    const ok = await confirm({
      title: `Delete "${survey.title}"?`,
      body: hasResponses ? (
        <>
          <p className="font-semibold text-red-800">
            This survey has {pluralize(survey.response_count, 'response')}.
          </p>
          <p>
            Deleting permanently removes the survey and all of its responses. This cannot be undone.
            Consider <strong>Archive</strong> instead to keep the results.
          </p>
        </>
      ) : (
        <p>This will permanently delete the survey and all of its responses.</p>
      ),
      confirmLabel: 'Delete',
      requireText: hasResponses ? 'DELETE' : undefined,
    })
    if (!ok) return
    await run(survey.id, async () => {
      await deleteSurvey(survey.id)
      await load()
    })
  }

  return (
    <InstructorLayout
      title="Dashboard"
      actions={
        <LinkButton to="/surveys/new" variant="primary">
          + New Survey
        </LinkButton>
      }
    >
      {dialog}

      {actionError && (
        <Alert tone="error" className="mb-4">
          {actionError}
        </Alert>
      )}

      {surveys === null && !loadError && <LoadingState label="Loading surveys..." />}

      {loadError && (
        <Alert tone="error" title="Could not load surveys">
          <p>{loadError}</p>
          <Button size="sm" className="mt-3" onClick={() => void load()}>
            Try again
          </Button>
        </Alert>
      )}

      {surveys && surveys.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="text-lg text-slate-700">You have not created any surveys yet.</p>
          <LinkButton to="/surveys/new" variant="primary" className="mt-6">
            Create Your First Survey
          </LinkButton>
        </div>
      )}

      {surveys && surveys.length > 0 && (
        <>
          {activeSurvey && (
            <section
              aria-label="Active survey"
              className="mb-6 rounded-xl border-2 border-green-500 bg-green-50 p-4 sm:p-5"
            >
              <p className="text-sm font-semibold uppercase tracking-wide text-green-900">
                ● Active now
              </p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                <p className="text-lg font-semibold text-slate-900">
                  {activeSurvey.title}{' '}
                  <span className="font-normal text-slate-700">
                    · {pluralize(activeSurvey.response_count, 'response')}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <LinkButton
                    to={`/surveys/${activeSurvey.id}/present`}
                    variant="primary"
                    size="sm"
                  >
                    Present QR
                  </LinkButton>
                  <LinkButton to={`/surveys/${activeSurvey.id}/results`} size="sm">
                    Results
                  </LinkButton>
                </div>
              </div>
            </section>
          )}

          <div className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="search" className="block text-sm font-medium text-slate-800">
                Search
              </label>
              <input
                id="search"
                type="search"
                placeholder="Survey title"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-slate-800">
                Status
              </label>
              <select
                id="status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="all">All</option>
                {SURVEY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="from" className="block text-sm font-medium text-slate-800">
                Created from
              </label>
              <input
                id="from"
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="to" className="block text-sm font-medium text-slate-800">
                Created to
              </label>
              <input
                id="to"
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            {filtersActive && (
              <div className="sm:col-span-2 lg:col-span-4">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSearch('')
                    setStatusFilter('all')
                    setFromDate('')
                    setToDate('')
                  }}
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>

          <p className="mb-3 text-sm text-slate-600" aria-live="polite">
            Showing {filtered.length} of {pluralize(surveys.length, 'survey')}
          </p>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-slate-700">
              No surveys match your search.
            </div>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {filtered.map((survey) => (
                <SurveyCard
                  key={survey.id}
                  survey={survey}
                  busy={busyId === survey.id}
                  disabled={busyId !== null}
                  onActivate={() => void handleActivate(survey)}
                  onClose={() => void handleClose(survey)}
                  onArchive={() => void handleArchive(survey)}
                  onRestore={() => void handleRestore(survey)}
                  onDuplicate={() => void handleDuplicate(survey)}
                  onDelete={() => void handleDelete(survey)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </InstructorLayout>
  )
}

interface SurveyCardProps {
  survey: SurveyListItem
  busy: boolean
  disabled: boolean
  onActivate: () => void
  onClose: () => void
  onArchive: () => void
  onRestore: () => void
  onDuplicate: () => void
  onDelete: () => void
}

function SurveyCard({
  survey,
  busy,
  disabled,
  onActivate,
  onClose,
  onArchive,
  onRestore,
  onDuplicate,
  onDelete,
}: SurveyCardProps) {
  const { status } = survey
  const editable = status !== 'active' && survey.response_count === 0
  const hasResults = status !== 'draft' || survey.response_count > 0

  return (
    <li
      className={`flex flex-col rounded-xl border bg-white p-5 shadow-sm ${
        status === 'active' ? 'border-green-500' : 'border-slate-200'
      }`}
      aria-busy={busy}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {editable ? (
            <Link
              to={`/surveys/${survey.id}/edit`}
              className="rounded hover:underline focus-visible:outline-3 focus-visible:outline-blue-600"
            >
              {survey.title}
            </Link>
          ) : (
            <Link
              to={`/surveys/${survey.id}/results`}
              className="rounded hover:underline focus-visible:outline-3 focus-visible:outline-blue-600"
            >
              {survey.title}
            </Link>
          )}
        </h2>
        <StatusBadge status={status} />
      </div>
      {survey.description && (
        <p className="mt-1 line-clamp-2 text-slate-600">{survey.description}</p>
      )}
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
        <div>
          <dt className="inline">Created: </dt>
          <dd className="inline">{formatDate(survey.created_at)}</dd>
        </div>
        <div>
          <dt className="inline">Responses: </dt>
          <dd className="inline font-medium text-slate-800">{survey.response_count}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2 pt-1">
        {status === 'active' && (
          <>
            <LinkButton to={`/surveys/${survey.id}/present`} variant="primary" size="sm">
              Present
            </LinkButton>
            <LinkButton to={`/surveys/${survey.id}/results`} size="sm">
              Results
            </LinkButton>
            <Button size="sm" onClick={onClose} disabled={disabled}>
              Close
            </Button>
          </>
        )}

        {status !== 'active' && hasResults && (
          <LinkButton to={`/surveys/${survey.id}/results`} size="sm">
            Results
          </LinkButton>
        )}

        {editable && (
          <LinkButton to={`/surveys/${survey.id}/edit`} size="sm">
            Edit
          </LinkButton>
        )}

        {(status === 'draft' || status === 'closed') && (
          <Button size="sm" variant="primary" onClick={onActivate} disabled={disabled}>
            {status === 'closed' ? 'Reopen' : 'Activate'}
          </Button>
        )}

        <Button size="sm" onClick={onDuplicate} disabled={disabled}>
          Duplicate
        </Button>

        {(status === 'draft' || status === 'closed') && (
          <Button size="sm" onClick={onArchive} disabled={disabled}>
            Archive
          </Button>
        )}

        {status === 'archived' && (
          <Button size="sm" onClick={onRestore} disabled={disabled}>
            Restore
          </Button>
        )}

        {status !== 'active' && (
          <Button size="sm" variant="ghost" onClick={onDelete} disabled={disabled}>
            <span className="text-red-700">Delete</span>
          </Button>
        )}
      </div>
      {busy && <p className="mt-2 text-sm text-slate-600">Working...</p>}
    </li>
  )
}
