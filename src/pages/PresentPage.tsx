import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QrCode } from '../components/QrCode'
import { Alert } from '../components/ui/Alert'
import { Button, LinkButton } from '../components/ui/Button'
import { LoadingState } from '../components/ui/LoadingState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useConfirm } from '../components/ui/useConfirm'
import { activateSurvey, closeSurvey, getResponseCount, getSurvey } from '../lib/api'
import { instructorErrorMessage } from '../lib/errors'
import { slugify } from '../lib/format'
import { useDocumentTitle, useInterval } from '../lib/hooks'
import { studentSurveyUrl } from '../lib/publicUrl'
import type { SurveyWithQuestions } from '../lib/types'

const POLL_MS = 3000

/** Projector view: big QR code, readable URL, live response count (UI.md section 6). */
export default function PresentPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { confirm, dialog } = useConfirm()

  const [survey, setSurvey] = useState<SurveyWithQuestions | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [qrPng, setQrPng] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  useDocumentTitle(survey ? `Present: ${survey.title}` : 'Present')

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([getSurvey(id), getResponseCount(id)])
      setSurvey(s)
      setCount(c)
      setError(null)
    } catch (err) {
      setError(instructorErrorMessage(err))
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    Promise.all([getSurvey(id), getResponseCount(id)])
      .then(([s, c]) => {
        if (cancelled) return
        setSurvey(s)
        setCount(c)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(instructorErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const isActive = survey?.status === 'active'

  useInterval(
    () => {
      getResponseCount(id)
        .then(setCount)
        .catch(() => {
          /* keep the last known count; next poll retries */
        })
    },
    POLL_MS,
    isActive,
  )

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      /* fullscreen not allowed: ignore */
    }
  }

  async function handleClose() {
    if (!survey) return
    const ok = await confirm({
      title: `Close "${survey.title}"?`,
      body: <p>Students will no longer be able to submit responses. Results are kept.</p>,
      confirmLabel: 'Close Survey',
    })
    if (!ok) return
    setBusy(true)
    setActionError(null)
    try {
      await closeSurvey(survey.id)
      await load()
    } catch (err) {
      setActionError(instructorErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleActivate() {
    if (!survey) return
    const ok = await confirm({
      title: `Activate "${survey.title}"?`,
      body: <p>If another survey is active it will be closed.</p>,
      confirmLabel: 'Activate',
      tone: 'primary',
    })
    if (!ok) return
    setBusy(true)
    setActionError(null)
    try {
      await activateSurvey(survey.id)
      await load()
    } catch (err) {
      setActionError(instructorErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked: the URL is visible anyway */
    }
  }

  const handleQrReady = useCallback((png: string) => setQrPng(png), [])

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <Alert tone="error" title="Could not load this survey">
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
      </main>
    )
  }

  if (!survey) return <LoadingState label="Loading survey..." fullPage />

  const url = survey.public_slug ? studentSurveyUrl(survey.public_slug) : null
  const displayUrl = url?.replace(/^https?:\/\//, '')

  return (
    <main className="flex min-h-screen flex-col bg-white">
      {dialog}

      {/* Minimal top bar: hidden content-wise during projection, but keyboard reachable */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 text-sm text-slate-600">
        <Link to="/dashboard" className="rounded px-2 py-1 underline hover:text-slate-900">
          ← Dashboard
        </Link>
        <div className="flex items-center gap-2">
          <StatusBadge status={survey.status} />
          <Button size="sm" variant="ghost" onClick={() => void toggleFullscreen()}>
            {fullscreen ? 'Exit full screen' : 'Full screen'}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-4 text-center">
        <h1 className="max-w-5xl text-3xl font-bold leading-tight text-slate-900 sm:text-5xl">
          {survey.title}
        </h1>

        {actionError && (
          <Alert tone="error" className="mt-4">
            {actionError}
          </Alert>
        )}

        {isActive && url ? (
          <>
            <p className="mt-2 text-lg text-slate-700 sm:text-2xl">
              Scan the QR code to answer the survey
            </p>
            <div className="mt-4 rounded-2xl border border-slate-200 p-3 shadow-sm">
              <QrCode
                value={url}
                onReady={handleQrReady}
                className="w-[min(80vw,max(220px,calc(100dvh_-_400px)))] max-w-[640px]"
              />
            </div>
            <p className="mt-4 break-all font-mono text-2xl font-semibold text-slate-900 sm:text-4xl">
              {displayUrl}
            </p>
            <p
              className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl"
              aria-live="polite"
              aria-atomic="true"
            >
              Responses: <span className="tabular-nums">{count ?? '–'}</span>
            </p>
          </>
        ) : (
          <div className="mt-8 max-w-xl">
            <Alert tone="warning" title="This survey is not active">
              <p>
                {survey.status === 'draft'
                  ? 'Activate it to generate the QR code for students.'
                  : 'It is no longer accepting responses. Reopen it to collect more.'}
              </p>
            </Alert>
            {survey.status !== 'archived' && (
              <Button
                variant="primary"
                size="lg"
                className="mt-6"
                onClick={() => void handleActivate()}
                disabled={busy}
              >
                {busy ? 'Activating...' : survey.status === 'draft' ? 'Activate' : 'Reopen'}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 border-t border-slate-100 px-4 py-3">
        <LinkButton to={`/surveys/${survey.id}/results`} size="lg">
          View Results
        </LinkButton>
        {isActive && url && (
          <>
            <Button size="lg" onClick={() => void copyLink(url)}>
              {copied ? 'Link copied' : 'Copy Link'}
            </Button>
            {qrPng && (
              <a
                href={qrPng}
                download={`${slugify(survey.title)}-qr.png`}
                className="inline-flex min-h-14 items-center justify-center rounded-lg border border-slate-300 bg-white px-6 text-lg font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Download QR Code
              </a>
            )}
            <Button variant="danger" size="lg" onClick={() => void handleClose()} disabled={busy}>
              {busy ? 'Closing...' : 'Close Survey'}
            </Button>
          </>
        )}
      </div>
    </main>
  )
}
