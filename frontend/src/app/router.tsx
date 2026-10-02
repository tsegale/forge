import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { NotFound } from '@/pages/NotFound'
import { Placeholder } from '@/pages/Placeholder'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Placeholder title="Catalog" /> },
      { path: 'configurator', element: <Placeholder title="Build a PC" /> },
      { path: 'orders', element: <Placeholder title="Orders" /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
