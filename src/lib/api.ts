// All data access goes through this module (API.md).
// Instructor calls run with the logged-in user's JWT (role "authenticated");
// student calls run with only the publishable key (role "anon"). Row Level Security and the
// RPC functions in supabase/migrations enforce who may do what.

import { supabase } from './supabase'
import type {
  AnswerInput,
  ExportData,
  ExportResponse,
  PublicSurveyResult,
  Question,
  QuestionInput,
  Survey,
  SurveyListItem,
  SurveyResults,
  SurveyStatus,
  SurveyWithQuestions,
} from './types'

const PAGE_SIZE = 1000 // PostgREST default max rows per request

// ---- Instructor: surveys ---------------------------------------------------------

/** Dashboard list, newest first, with a response count per survey. */
export async function listSurveys(): Promise<SurveyListItem[]> {
  const { data, error } = await supabase
    .from('surveys')
    .select('*, responses(count)')
    .order('created_at', { ascending: false })
  if (error) throw error

  type Row = Survey & { responses: { count: number }[] }
  return (data as Row[]).map(({ responses, ...survey }) => ({
    ...survey,
    response_count: responses?.[0]?.count ?? 0,
  }))
}

/** One survey with its questions and choices, sorted by position. */
export async function getSurvey(id: string): Promise<SurveyWithQuestions> {
  const { data, error } = await supabase
    .from('surveys')
    .select('*, questions(*, choices(*))')
    .eq('id', id)
    .single()
  if (error) throw error

  const survey = data as SurveyWithQuestions
  survey.questions = [...(survey.questions ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((q: Question) => ({
      ...q,
      choices: [...(q.choices ?? [])].sort((a, b) => a.position - b.position),
    }))
  return survey
}

/** The currently active survey, if any (used to warn before activating another). */
export async function getActiveSurvey(): Promise<Pick<Survey, 'id' | 'title'> | null> {
  const { data, error } = await supabase
    .from('surveys')
    .select('id, title')
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return data as Pick<Survey, 'id' | 'title'> | null
}

export async function getResponseCount(surveyId: string): Promise<number> {
  const { count, error } = await supabase
    .from('responses')
    .select('id', { count: 'exact', head: true })
    .eq('survey_id', surveyId)
  if (error) throw error
  return count ?? 0
}

/** Creates (surveyId = null) or replaces a draft atomically. Returns the survey id. */
export async function saveSurvey(
  surveyId: string | null,
  title: string,
  description: string,
  questions: QuestionInput[],
): Promise<string> {
  const { data, error } = await supabase.rpc('save_survey', {
    p_survey_id: surveyId,
    p_title: title,
    p_description: description,
    p_questions: questions,
  })
  if (error) throw error
  return data as string
}

export async function activateSurvey(
  surveyId: string,
): Promise<{ id: string; status: SurveyStatus; public_slug: string }> {
  const { data, error } = await supabase.rpc('activate_survey', { p_survey_id: surveyId })
  if (error) throw error
  return data as { id: string; status: SurveyStatus; public_slug: string }
}

export async function closeSurvey(surveyId: string): Promise<void> {
  const { error } = await supabase.rpc('close_survey', { p_survey_id: surveyId })
  if (error) throw error
}

/** Archive or restore (closed). Activation must go through activateSurvey. */
export async function setSurveyStatus(
  surveyId: string,
  status: Extract<SurveyStatus, 'archived' | 'closed' | 'draft'>,
): Promise<void> {
  const { error } = await supabase.from('surveys').update({ status }).eq('id', surveyId)
  if (error) throw error
}

/** Deletes the survey; questions, choices, responses and answers cascade. */
export async function deleteSurvey(surveyId: string): Promise<void> {
  const { error } = await supabase.from('surveys').delete().eq('id', surveyId)
  if (error) throw error
}

/** Copies survey, questions and choices (not responses) into a new Draft. */
export async function duplicateSurvey(surveyId: string): Promise<string> {
  const { data, error } = await supabase.rpc('duplicate_survey', { p_survey_id: surveyId })
  if (error) throw error
  return data as string
}

// ---- Instructor: results and export ------------------------------------------

export async function getSurveyResults(surveyId: string): Promise<SurveyResults> {
  const { data, error } = await supabase.rpc('get_survey_results', { p_survey_id: surveyId })
  if (error) throw error
  return data as SurveyResults
}

/** Everything needed for the per-response CSV, paging past the 1000-row limit. */
export async function getExportData(surveyId: string): Promise<ExportData> {
  const survey = await getSurvey(surveyId)
  const responses: ExportResponse[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('responses')
      .select('id, submitted_at, answers(question_id, choice_id)')
      .eq('survey_id', surveyId)
      .order('submitted_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    responses.push(...(data as ExportResponse[]))
    if (data.length < PAGE_SIZE) break
  }

  return { survey, responses }
}

// ---- Students (anonymous) ---------------------------------------------------------

export async function getPublicSurvey(slug: string): Promise<PublicSurveyResult> {
  const { data, error } = await supabase.rpc('get_public_survey', { p_slug: slug })
  if (error) throw error
  const result = data as PublicSurveyResult
  if (result.status === 'active') {
    result.questions = [...result.questions]
      .sort((a, b) => a.position - b.position)
      .map((q) => ({ ...q, choices: [...q.choices].sort((a, b) => a.position - b.position) }))
  }
  return result
}

export async function submitSurveyResponse(
  surveyId: string,
  anonymousToken: string,
  answers: AnswerInput[],
): Promise<{ success: true; response_id: string }> {
  const { data, error } = await supabase.rpc('submit_survey_response', {
    p_survey_id: surveyId,
    p_anonymous_token: anonymousToken,
    p_answers: answers,
  })
  if (error) throw error
  return data as { success: true; response_id: string }
}
