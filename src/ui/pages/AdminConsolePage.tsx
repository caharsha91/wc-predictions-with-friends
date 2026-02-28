import { Navigate, useLocation } from 'react-router-dom'

export default function AdminConsolePage() {
  const location = useLocation()
  const targetPath = location.pathname.startsWith('/demo/') ? '/demo/admin/players' : '/admin/players'
  return <Navigate to={targetPath} replace />
}
