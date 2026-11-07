import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './authContext'
import { LoadingState } from '../ui/LoadingState'

/** Redirects to /login when there is no instructor session. */
export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingState label="Checking login..." fullPage />
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}
