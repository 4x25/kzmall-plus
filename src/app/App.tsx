import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AdminLayout } from './layouts/AdminLayout'
import { LoginPage } from './pages/login'
import { DashboardPage } from './pages/dashboard'
import { InventoryPage } from './pages/inventory'

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    path: '/',
    element: <AdminLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'inventory', element: <InventoryPage /> }
    ]
  }
])

export function App() {
  return <RouterProvider router={router} />
}