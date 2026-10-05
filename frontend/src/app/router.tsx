import { createBrowserRouter, type RouteObject } from 'react-router'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { BuildsPage } from '@/pages/builds/BuildsPage'
import { CartPage } from '@/pages/cart/CartPage'
import { CheckoutPage } from '@/pages/checkout/CheckoutPage'
import { PayPage } from '@/pages/checkout/PayPage'
import { CatalogPage } from '@/pages/catalog/CatalogPage'
import { ProductPage } from '@/pages/catalog/ProductPage'
import { ConfiguratorPage } from '@/pages/configurator/ConfiguratorPage'
import { NotFound } from '@/pages/NotFound'
import { Placeholder } from '@/pages/Placeholder'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <CatalogPage /> },
      { path: 'products/:slug', element: <ProductPage /> },
      { path: 'configurator', element: <ConfiguratorPage /> },
      {
        path: 'builds',
        element: (
          <RequireAuth>
            <BuildsPage />
          </RequireAuth>
        ),
      },
      { path: 'cart', element: <CartPage /> },
      {
        path: 'checkout',
        element: (
          <RequireAuth>
            <CheckoutPage />
          </RequireAuth>
        ),
      },
      {
        path: 'orders/:orderNumber/pay',
        element: (
          <RequireAuth>
            <PayPage />
          </RequireAuth>
        ),
      },
      { path: 'orders', element: <Placeholder title="Orders" /> },
      { path: 'orders/:orderNumber', element: <Placeholder title="Order" /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
