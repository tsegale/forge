import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { CatalogPage } from '@/pages/catalog/CatalogPage'
import { ProductPage } from '@/pages/catalog/ProductPage'
import { NotFound } from '@/pages/NotFound'
import { Placeholder } from '@/pages/Placeholder'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <CatalogPage /> },
      { path: 'products/:slug', element: <ProductPage /> },
      { path: 'configurator', element: <Placeholder title="Build a PC" /> },
      { path: 'orders', element: <Placeholder title="Orders" /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
