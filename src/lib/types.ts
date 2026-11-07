// Shapes of the rows and RPC payloads described in API.md / DATABASE.md.

export type SurveyStatus = 'draft' | 'active' | 'closed' | 'archived'
export type QuestionType = 'multiple_choice' | 'true_false'

export const SURVEY_STATUSES: SurveyStatus[] = ['draft', 'active', 'closed', 'archived']

export interface Survey {
  id: string
  title: string
  description: string | null
  status: SurveyStatus
  public_slug: string | null
  created_at: string
  updated_at: string
}

export interface SurveyListItem extends Survey {
  response_count: number
}

export interface Choice {
  id: string
  question_id: string
  choice_text: string
  position: number
}

export interface Question {
  id: string
  survey_id: string
  question_text: string
  question_type: QuestionType
  position: number
  choices: Choice[]
}

export interface SurveyWithQuestions extends Survey {
  questions: Question[]
}

/** Payload sent to the save_survey RPC. Array order defines position. */
export interface QuestionInput {
  question_text: string
  question_type: QuestionType
  choices: { choice_text: string }[]
}

// ---- Public (student) survey: get_public_survey RPC -------------------------

export interface PublicChoice {
  id: string
  choice_text: string
  position: number
}

export interface PublicQuestion {
  id: string
  question_text: string
  question_type: QuestionType
  position: number
  choices: PublicChoice[]
}

export type PublicSurveyResult =
  | { status: 'not_found' }
  | { status: 'closed' }
  | {
      status: 'active'
      survey: { id: string; title: string; description: string | null }
      questions: PublicQuestion[]
    }

export interface AnswerInput {
  question_id: string
  choice_id: string
}

// ---- Results: get_survey_results RPC -----------------------------------------

export interface ChoiceResult {
  choice_id: string
  choice_text: string
  count: number
  percentage: number
}

export interface QuestionResult {
  question_id: string
  question_text: string
  question_type: QuestionType
  position: number
  response_count: number
  choices: ChoiceResult[]
}

export interface SurveyResults {
  survey_id: string
  response_count: number
  questions: QuestionResult[]
}

// ---- CSV export ----------------------------------------------------------------

export interface ExportResponse {
  id: string
  submitted_at: string
  answers: { question_id: string; choice_id: string | null }[]
}

export interface ExportData {
  survey: SurveyWithQuestions
  responses: ExportResponse[]
}
