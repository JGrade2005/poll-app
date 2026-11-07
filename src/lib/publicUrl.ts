/** Base URL students use, e.g. https://classroom-survey.pages.dev */
export function publicSiteUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined
  const base = configured && configured.trim() !== '' ? configured : window.location.origin
  return base.replace(/\/+$/, '')
}

/** Public student URL for a survey slug: <site>/s/<slug> */
export function studentSurveyUrl(slug: string): string {
  return `${publicSiteUrl()}/s/${encodeURIComponent(slug)}`
}
