// CSV export, generated in the browser (API.md section 12).

import { formatDateTime } from './format'
import type { ExportData, SurveyResults, SurveyWithQuestions } from './types'

type Cell = string | number | null | undefined

const PLAIN_NUMBER = /^[-+]?\d+(\.\d+)?$/
const FORMULA_START = /^[=+\-@\t\r]/

/**
 * Escapes one CSV cell (RFC 4180) and neutralises spreadsheet formulas
 * (cells starting with = + - @ would be executed by Excel/Sheets).
 */
export function escapeCsvCell(value: Cell): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''

  let text = value
  if (FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) {
    text = `'${text}`
  }
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function toCsv(rows: Cell[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n') + '\r\n'
}

function sortedQuestions(survey: SurveyWithQuestions) {
  return [...survey.questions].sort((a, b) => a.position - b.position)
}

/**
 * One row per response (recommended layout in API.md):
 *   response_id, submitted_at, <question 1 text>, <question 2 text>, ...
 * Each question column holds the text of the chosen answer.
 */
export function buildResponsesCsv({ survey, responses }: ExportData): string {
  const questions = sortedQuestions(survey)
  const choiceText = new Map<string, string>()
  for (const q of questions) for (const c of q.choices) choiceText.set(c.id, c.choice_text)

  const header: Cell[] = [
    'response_id',
    'submitted_at',
    ...questions.map((q, i) => `Q${i + 1}. ${q.question_text}`),
  ]

  const rows: Cell[][] = responses.map((response) => {
    const byQuestion = new Map(response.answers.map((a) => [a.question_id, a.choice_id]))
    return [
      response.id,
      response.submitted_at,
      ...questions.map((q) => {
        const choiceId = byQuestion.get(q.id)
        return choiceId ? (choiceText.get(choiceId) ?? '') : ''
      }),
    ]
  })

  return toCsv([header, ...rows])
}

/**
 * Survey metadata plus aggregated counts and percentages for every choice.
 */
export function buildSummaryCsv(
  survey: SurveyWithQuestions,
  results: SurveyResults,
  exportedAt: Date = new Date(),
): string {
  const rows: Cell[][] = [
    ['Survey', survey.title],
    ['Description', survey.description ?? ''],
    ['Status', survey.status],
    ['Survey ID', survey.id],
    ['Public slug', survey.public_slug ?? ''],
    ['Created', formatDateTime(survey.created_at)],
    ['Exported', formatDateTime(exportedAt.toISOString())],
    ['Total responses', results.response_count],
    [],
    ['Question #', 'Question', 'Choice', 'Count', 'Percentage', 'Answered'],
  ]

  const questions = [...results.questions].sort((a, b) => a.position - b.position)
  questions.forEach((q, i) => {
    for (const c of q.choices) {
      rows.push([
        i + 1,
        q.question_text,
        c.choice_text,
        c.count,
        `${c.percentage}%`,
        q.response_count,
      ])
    }
  })

  return toCsv(rows)
}

/** Triggers a download in the browser. Adds a UTF-8 BOM so Excel shows accents correctly. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
