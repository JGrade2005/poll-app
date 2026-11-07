import { describe, expect, it } from 'vitest'
import {
  classifyError,
  dbErrorCode,
  instructorErrorMessage,
  isNetworkError,
  studentErrorMessage,
} from './errors'

// Shape of a PostgrestError raised by `raise exception 'X' using errcode = 'P0001'`
const rpcError = (message: string) => ({ message, code: 'P0001', details: null, hint: null })

describe('dbErrorCode', () => {
  it('extracts RPC error codes', () => {
    expect(dbErrorCode(rpcError('DUPLICATE_RESPONSE'))).toBe('DUPLICATE_RESPONSE')
    expect(dbErrorCode(rpcError('SURVEY_NOT_ACTIVE'))).toBe('SURVEY_NOT_ACTIVE')
  })

  it('does not confuse INVALID_QUESTION with INVALID_QUESTION_TYPE', () => {
    expect(dbErrorCode(rpcError('INVALID_QUESTION_TYPE'))).toBe('INVALID_QUESTION_TYPE')
    expect(dbErrorCode(rpcError('INVALID_QUESTION'))).toBe('INVALID_QUESTION')
  })

  it('returns null for unrelated errors', () => {
    expect(dbErrorCode(new Error('boom'))).toBeNull()
    expect(dbErrorCode(null)).toBeNull()
  })
})

describe('classifyError', () => {
  it('detects network failures', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(classifyError({ message: 'TypeError: Load failed', code: '' })).toBe('network')
  })

  it('maps database codes to kinds', () => {
    expect(classifyError(rpcError('SURVEY_NOT_ACTIVE'))).toBe('closed')
    expect(classifyError(rpcError('DUPLICATE_RESPONSE'))).toBe('duplicate')
    expect(classifyError(rpcError('INVALID_CHOICE'))).toBe('validation')
    expect(classifyError(rpcError('SURVEY_HAS_RESPONSES'))).toBe('conflict')
  })

  it('maps auth and not-found PostgREST codes', () => {
    expect(classifyError({ message: 'permission denied for table responses', code: '42501' })).toBe(
      'auth',
    )
    expect(classifyError({ message: 'JWT expired', code: 'PGRST301' })).toBe('auth')
    expect(classifyError({ message: 'no rows', code: 'PGRST116' })).toBe('not_found')
  })

  it('falls back to unexpected', () => {
    expect(classifyError(new Error('weird'))).toBe('unexpected')
  })
})

describe('studentErrorMessage', () => {
  it('uses the wording from UI.md', () => {
    expect(studentErrorMessage(rpcError('SURVEY_NOT_ACTIVE'))).toBe(
      'This survey is no longer accepting responses.',
    )
    expect(studentErrorMessage(rpcError('DUPLICATE_RESPONSE'))).toBe(
      'You have already submitted a response to this survey.',
    )
  })

  it('asks for missing answers', () => {
    expect(studentErrorMessage(rpcError('MISSING_REQUIRED_ANSWER'))).toMatch(
      /answer every question/,
    )
  })

  it('never leaks raw database text', () => {
    const raw = { message: 'duplicate key value violates unique constraint "x"', code: '23505' }
    expect(studentErrorMessage(raw)).toBe('Something went wrong. Please try again.')
    expect(studentErrorMessage(raw)).not.toContain('constraint')
  })
})

describe('instructorErrorMessage', () => {
  it('explains editor and activation errors', () => {
    expect(instructorErrorMessage(rpcError('SURVEY_HAS_NO_QUESTIONS'))).toMatch(
      /at least one question/,
    )
    expect(instructorErrorMessage(rpcError('SURVEY_IS_ACTIVE'))).toMatch(/Close it before editing/)
  })

  it('handles auth problems', () => {
    expect(instructorErrorMessage({ message: 'JWT expired', code: 'PGRST301' })).toBe(
      'Authentication required. Please log in again.',
    )
  })
})
