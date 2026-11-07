// Client-side model and validation for the survey editor (UI.md section 5).

import { randomToken } from './anonymousToken'
import type { QuestionInput, QuestionType, SurveyWithQuestions } from './types'

export const MAX_TITLE_LENGTH = 200
export const MAX_DESCRIPTION_LENGTH = 1000
export const MAX_QUESTION_LENGTH = 500
export const MAX_CHOICE_LENGTH = 200
export const MAX_CHOICES = 10

export interface EditorChoice {
  key: string
  choice_text: string
}

export interface EditorQuestion {
  key: string
  question_text: string
  question_type: QuestionType
  /** Multiple-choice options. Kept while the type is True/False so switching back loses nothing. */
  choices: EditorChoice[]
}

export interface EditorState {
  title: string
  description: string
  questions: EditorQuestion[]
}

export interface QuestionErrors {
  question_text?: string
  choices?: string
  choiceItems?: Record<string, string>
}

export interface EditorErrors {
  title?: string
  questions?: string
  byQuestion: Record<string, QuestionErrors>
}

export const newKey = (): string => randomToken()

export function newChoice(text = ''): EditorChoice {
  return { key: newKey(), choice_text: text }
}

export function newQuestion(type: QuestionType = 'multiple_choice'): EditorQuestion {
  return {
    key: newKey(),
    question_text: '',
    question_type: type,
    choices: [newChoice(), newChoice()],
  }
}

export function emptyEditorState(): EditorState {
  return { title: '', description: '', questions: [newQuestion()] }
}

export function editorStateFromSurvey(survey: SurveyWithQuestions): EditorState {
  const questions = [...survey.questions]
    .sort((a, b) => a.position - b.position)
    .map<EditorQuestion>((q) => ({
      key: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      choices:
        q.question_type === 'true_false'
          ? [newChoice(), newChoice()]
          : [...q.choices]
              .sort((a, b) => a.position - b.position)
              .map((c) => ({ key: c.id, choice_text: c.choice_text })),
    }))
  return {
    title: survey.title,
    description: survey.description ?? '',
    questions,
  }
}

/** Moves the item at `index` by `delta` positions, returning a new array. */
export function move<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items
  const copy = [...items]
  const [item] = copy.splice(index, 1)
  copy.splice(target, 0, item)
  return copy
}

export function hasErrors(errors: EditorErrors): boolean {
  return Boolean(errors.title || errors.questions || Object.keys(errors.byQuestion).length > 0)
}

/**
 * Validates the editor form.
 * @param forActivation activation additionally requires at least one question.
 */
export function validateEditor(state: EditorState, forActivation = false): EditorErrors {
  const errors: EditorErrors = { byQuestion: {} }

  if (state.title.trim() === '') errors.title = 'Survey title is required.'
  else if (state.title.trim().length > MAX_TITLE_LENGTH)
    errors.title = `Keep the title under ${MAX_TITLE_LENGTH} characters.`

  if (forActivation && state.questions.length === 0) {
    errors.questions = 'Add at least one question before activating.'
  }

  for (const q of state.questions) {
    const qErrors: QuestionErrors = {}

    if (q.question_text.trim() === '') qErrors.question_text = 'Question text is required.'

    if (q.question_type === 'multiple_choice') {
      // Fewer than two choices is a question-level error; blank choices are
      // flagged individually next to the affected field.
      if (q.choices.length < 2) {
        qErrors.choices = 'Add at least two answer choices.'
      }

      const items: Record<string, string> = {}
      const seen = new Set<string>()
      for (const c of q.choices) {
        const normalized = c.choice_text.trim().toLowerCase()
        if (normalized === '') items[c.key] = 'Choice text is required (or delete this choice).'
        else if (seen.has(normalized)) items[c.key] = 'This choice is a duplicate.'
        seen.add(normalized)
      }
      if (Object.keys(items).length > 0) qErrors.choiceItems = items
    }

    if (Object.keys(qErrors).length > 0) errors.byQuestion[q.key] = qErrors
  }

  return errors
}

/** Converts editor state to the save_survey RPC payload. */
export function toQuestionInputs(state: EditorState): QuestionInput[] {
  return state.questions.map((q) => ({
    question_text: q.question_text.trim(),
    question_type: q.question_type,
    choices:
      q.question_type === 'true_false'
        ? [{ choice_text: 'True' }, { choice_text: 'False' }]
        : q.choices.map((c) => ({ choice_text: c.choice_text.trim() })),
  }))
}

/** Stable string used to detect unsaved changes. */
export function snapshot(state: EditorState): string {
  return JSON.stringify({
    title: state.title.trim(),
    description: state.description.trim(),
    questions: toQuestionInputs(state),
  })
}
