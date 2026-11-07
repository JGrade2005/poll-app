import { describe, expect, it } from 'vitest'
import { buildResponsesCsv, buildSummaryCsv, escapeCsvCell, toCsv } from './csv'
import type { ExportData, SurveyResults, SurveyWithQuestions } from './types'

const survey: SurveyWithQuestions = {
  id: 'survey-1',
  title: 'Recursion, "basics"',
  description: null,
  status: 'closed',
  public_slug: 'x7kf2q',
  created_at: '2026-08-17T12:00:00Z',
  updated_at: '2026-08-17T12:05:00Z',
  questions: [
    // deliberately out of order: export must sort by position
    {
      id: 'q2',
      survey_id: 'survey-1',
      question_text: 'Needs a stopping condition?',
      question_type: 'true_false',
      position: 2,
      choices: [
        { id: 'c-true', question_id: 'q2', choice_text: 'True', position: 1 },
        { id: 'c-false', question_id: 'q2', choice_text: 'False', position: 2 },
      ],
    },
    {
      id: 'q1',
      survey_id: 'survey-1',
      question_text: 'What is required, exactly?',
      question_type: 'multiple_choice',
      position: 1,
      choices: [
        { id: 'c-base', question_id: 'q1', choice_text: 'A base case', position: 1 },
        { id: 'c-eq', question_id: 'q1', choice_text: '=SUM(A1:A9)', position: 2 },
      ],
    },
  ],
}

describe('escapeCsvCell', () => {
  it('leaves plain values alone', () => {
    expect(escapeCsvCell('hello')).toBe('hello')
    expect(escapeCsvCell(42)).toBe('42')
    expect(escapeCsvCell(86.5)).toBe('86.5')
  })

  it('renders null and undefined as empty', () => {
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
  })

  it('quotes commas, quotes and newlines (RFC 4180)', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('neutralises spreadsheet formulas', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1")
    expect(escapeCsvCell('+cmd')).toBe("'+cmd")
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(escapeCsvCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"')
  })

  it('keeps negative numbers readable', () => {
    expect(escapeCsvCell('-1')).toBe('-1')
    expect(escapeCsvCell('+2.5')).toBe('+2.5')
  })
})

describe('toCsv', () => {
  it('uses CRLF line endings', () => {
    expect(
      toCsv([
        ['a', 'b'],
        [1, 2],
      ]),
    ).toBe('a,b\r\n1,2\r\n')
  })
})

describe('buildResponsesCsv', () => {
  const data: ExportData = {
    survey,
    responses: [
      {
        id: 'r1',
        submitted_at: '2026-08-17T12:10:00Z',
        answers: [
          { question_id: 'q2', choice_id: 'c-true' },
          { question_id: 'q1', choice_id: 'c-base' },
        ],
      },
      {
        id: 'r2',
        submitted_at: '2026-08-17T12:11:00Z',
        answers: [{ question_id: 'q1', choice_id: 'c-eq' }],
      },
    ],
  }

  it('writes one row per response with question text headers in position order', () => {
    const lines = buildResponsesCsv(data).trimEnd().split('\r\n')
    expect(lines[0]).toBe(
      'response_id,submitted_at,"Q1. What is required, exactly?",Q2. Needs a stopping condition?',
    )
    expect(lines[1]).toBe('r1,2026-08-17T12:10:00Z,A base case,True')
    // unanswered question -> empty cell; formula choice neutralised
    expect(lines[2]).toBe("r2,2026-08-17T12:11:00Z,'=SUM(A1:A9),")
    expect(lines).toHaveLength(3)
  })
})

describe('buildSummaryCsv', () => {
  const results: SurveyResults = {
    survey_id: 'survey-1',
    response_count: 2,
    questions: [
      {
        question_id: 'q1',
        question_text: 'What is required, exactly?',
        question_type: 'multiple_choice',
        position: 1,
        response_count: 2,
        choices: [
          { choice_id: 'c-base', choice_text: 'A base case', count: 1, percentage: 50 },
          { choice_id: 'c-eq', choice_text: '=SUM(A1:A9)', count: 1, percentage: 50 },
        ],
      },
    ],
  }

  it('includes survey metadata and per-choice counts', () => {
    const csv = buildSummaryCsv(survey, results, new Date('2026-08-18T00:00:00Z'))
    expect(csv).toContain('Survey,"Recursion, ""basics"""')
    expect(csv).toContain('Status,closed')
    expect(csv).toContain('Total responses,2')
    expect(csv).toContain('Question #,Question,Choice,Count,Percentage,Answered')
    expect(csv).toContain('1,"What is required, exactly?",A base case,1,50%,2')
    expect(csv).toContain('1,"What is required, exactly?",\'=SUM(A1:A9),1,50%,2')
  })
})
