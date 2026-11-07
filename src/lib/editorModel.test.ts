import { describe, expect, it } from 'vitest'
import {
  editorStateFromSurvey,
  emptyEditorState,
  hasErrors,
  move,
  newChoice,
  newQuestion,
  snapshot,
  toQuestionInputs,
  validateEditor,
  type EditorState,
} from './editorModel'
import type { SurveyWithQuestions } from './types'

function validState(): EditorState {
  return {
    title: 'Recursion Concept Check',
    description: '',
    questions: [
      {
        ...newQuestion('multiple_choice'),
        question_text: 'What is required?',
        choices: [newChoice('A base case'), newChoice('A loop')],
      },
      { ...newQuestion('true_false'), question_text: 'Recursion needs a base case.' },
    ],
  }
}

describe('validateEditor', () => {
  it('accepts a complete survey', () => {
    expect(hasErrors(validateEditor(validState()))).toBe(false)
    expect(hasErrors(validateEditor(validState(), true))).toBe(false)
  })

  it('requires a title', () => {
    const state = { ...validState(), title: '   ' }
    expect(validateEditor(state).title).toBe('Survey title is required.')
  })

  it('flags blank question text next to the question', () => {
    const state = validState()
    state.questions[0].question_text = ''
    const errors = validateEditor(state)
    expect(errors.byQuestion[state.questions[0].key].question_text).toBe(
      'Question text is required.',
    )
  })

  it('requires at least two choices for multiple choice', () => {
    const state = validState()
    state.questions[0].choices = [newChoice('Only one')]
    expect(validateEditor(state).byQuestion[state.questions[0].key].choices).toMatch(/at least two/)
  })

  it('flags blank and duplicate choices individually', () => {
    const state = validState()
    const blank = newChoice('')
    const dup = newChoice('a base case ')
    state.questions[0].choices.push(blank, dup)
    const items = validateEditor(state).byQuestion[state.questions[0].key].choiceItems!
    expect(items[blank.key]).toMatch(/required/)
    expect(items[dup.key]).toMatch(/duplicate/)
  })

  it('ignores the hidden multiple-choice options of a True/False question', () => {
    const state = validState()
    state.questions[1].choices = [newChoice('')]
    expect(hasErrors(validateEditor(state))).toBe(false)
  })

  it('allows saving a draft without questions but not activating it', () => {
    const state = { ...validState(), questions: [] }
    expect(hasErrors(validateEditor(state, false))).toBe(false)
    expect(validateEditor(state, true).questions).toMatch(/at least one question/)
  })
})

describe('toQuestionInputs', () => {
  it('trims text and forces True/False choices', () => {
    const state = validState()
    state.questions[0].question_text = '  What is required?  '
    const inputs = toQuestionInputs(state)
    expect(inputs[0]).toEqual({
      question_text: 'What is required?',
      question_type: 'multiple_choice',
      choices: [{ choice_text: 'A base case' }, { choice_text: 'A loop' }],
    })
    expect(inputs[1].choices).toEqual([{ choice_text: 'True' }, { choice_text: 'False' }])
  })
})

describe('move', () => {
  it('reorders without losing items', () => {
    expect(move(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    expect(move(['a', 'b', 'c'], 2, -2)).toEqual(['c', 'a', 'b'])
  })

  it('ignores moves past the ends', () => {
    const items = ['a', 'b']
    expect(move(items, 0, -1)).toBe(items)
    expect(move(items, 1, 1)).toBe(items)
  })
})

describe('editorStateFromSurvey', () => {
  it('loads questions and choices sorted by position', () => {
    const survey: SurveyWithQuestions = {
      id: 's',
      title: 'T',
      description: null,
      status: 'draft',
      public_slug: null,
      created_at: '',
      updated_at: '',
      questions: [
        {
          id: 'q2',
          survey_id: 's',
          question_text: 'Second',
          question_type: 'true_false',
          position: 2,
          choices: [],
        },
        {
          id: 'q1',
          survey_id: 's',
          question_text: 'First',
          question_type: 'multiple_choice',
          position: 1,
          choices: [
            { id: 'b', question_id: 'q1', choice_text: 'B', position: 2 },
            { id: 'a', question_id: 'q1', choice_text: 'A', position: 1 },
          ],
        },
      ],
    }
    const state = editorStateFromSurvey(survey)
    expect(state.description).toBe('')
    expect(state.questions.map((q) => q.question_text)).toEqual(['First', 'Second'])
    expect(state.questions[0].choices.map((c) => c.choice_text)).toEqual(['A', 'B'])
  })
})

describe('snapshot', () => {
  it('ignores whitespace-only edits and detects real changes', () => {
    const a = validState()
    const b = { ...a, title: `${a.title}  ` }
    expect(snapshot(a)).toBe(snapshot(b))
    expect(snapshot(a)).not.toBe(snapshot({ ...a, title: 'Other' }))
  })

  it('starts from a single blank question', () => {
    expect(emptyEditorState().questions).toHaveLength(1)
  })
})
