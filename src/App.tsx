import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './components/auth/AuthProvider'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { ConfigMissing } from './components/ConfigMissing'
import { LoadingState } from './components/ui/LoadingState'
import { supabaseConfigured } from './lib/supabase'

// Route-level code splitting: students scanning the QR code download only the
// survey page, not the instructor editor, charts, or QR generator.
const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const SurveyEditorPage = lazy(() => import('./pages/SurveyEditorPage'))
const PresentPage = lazy(() => import('./pages/PresentPage'))
const ResultsPage = lazy(() => import('./pages/ResultsPage'))
const StudentSurveyPage = lazy(() => import('./pages/StudentSurveyPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState label="Loading..." fullPage />}>{children}</Suspense>
}

function Root() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}

// Routes from UI.md section 1.
const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        path: '/',
        element: (
          <Page>
            <LandingPage />
          </Page>
        ),
      },
      {
        path: '/login',
        element: (
          <Page>
            <LoginPage />
          </Page>
        ),
      },
      {
        path: '/s/:slug',
        element: (
          <Page>
            <StudentSurveyPage />
          </Page>
        ),
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: '/dashboard',
            element: (
              <Page>
                <DashboardPage />
              </Page>
            ),
          },
          {
            path: '/surveys/new',
            element: (
              <Page>
                <SurveyEditorPage />
              </Page>
            ),
          },
          {
            path: '/surveys/:id/edit',
            element: (
              <Page>
                <SurveyEditorPage />
              </Page>
            ),
          },
          {
            path: '/surveys/:id/present',
            element: (
              <Page>
                <PresentPage />
              </Page>
            ),
          },
          {
            path: '/surveys/:id/results',
            element: (
              <Page>
                <ResultsPage />
              </Page>
            ),
          },
        ],
      },
      {
        path: '*',
        element: (
          <Page>
            <NotFoundPage />
          </Page>
        ),
      },
    ],
  },
])

export default function App() {
  if (!supabaseConfigured) return <ConfigMissing />
  return <RouterProvider router={router} />
}
