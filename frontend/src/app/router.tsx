import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppShell } from '@/components/layout/AppShell'
import { CheckoutShell } from '@/components/layout/CheckoutShell'
import { AccountLayout } from '@/pages/account/AccountLayout'
import { AccountOverview } from '@/pages/account/AccountOverview'
import { AddressesPage } from '@/pages/account/AddressesPage'
import { AlertsPage } from '@/pages/account/AlertsPage'
import { ProfilePage } from '@/pages/account/ProfilePage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { BuildsPage } from '@/pages/builds/BuildsPage'
import { CartPage } from '@/pages/cart/CartPage'
import { CheckoutPage } from '@/pages/checkout/CheckoutPage'
import { ConfirmationPage } from '@/pages/checkout/ConfirmationPage'
import { CatalogPage } from '@/pages/catalog/CatalogPage'
import { ProductPage } from '@/pages/catalog/ProductPage'
import { ConfiguratorPage } from '@/pages/configurator/ConfiguratorPage'
import { RouteError } from '@/pages/errors/RouteError'
import { HomePage } from '@/pages/home/HomePage'
import { NotFound } from '@/pages/NotFound'
import { OrderPage } from '@/pages/orders/OrderPage'
import { OrdersPage } from '@/pages/orders/OrdersPage'

/**
 * Pages most visitors never open load on demand, so they stay out of the bundle every page
 * downloads. The router fetches the code during navigation, keeping the current page on screen
 * until it arrives. The back office is one chunk (./pages/admin/index.ts).
 */
const admin = () => import('@/pages/admin')

export const routes: RouteObject[] = [
  {
    // Checkout, payment and confirmation: a focused frame without the store navigation.
    element: (
      <RequireAuth>
        <CheckoutShell />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      {
        // A failing page renders inside the frame, not instead of it.
        errorElement: <RouteError />,
        children: [
          { path: 'checkout', element: <CheckoutPage /> },
          {
            // Loaded on demand: Stripe's libraries stay out of the bundle every other page downloads.
            path: 'orders/:orderNumber/pay',
            lazy: async () => ({ Component: (await import('@/pages/checkout/PayPage')).PayPage }),
          },
          { path: 'orders/:orderNumber/confirmation', element: <ConfirmationPage /> },
        ],
      },
    ],
  },
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          // Full bleed: the page lays out its own containers, so the hero can span the window.
          { index: true, element: <HomePage />, handle: { fullBleed: true } },
          { path: 'shop', element: <CatalogPage /> },
          { path: 'shop/:kind', element: <CatalogPage /> },
          { path: 'search', element: <CatalogPage /> },
          { path: 'products/:slug', element: <ProductPage /> },
          { path: 'configurator', element: <ConfiguratorPage /> },
          { path: 'cart', element: <CartPage /> },
          {
            // The account: one layout and one sign-in gate for every page about the customer's own data.
            element: (
              <RequireAuth>
                <AccountLayout />
              </RequireAuth>
            ),
            children: [
              { path: 'account', element: <AccountOverview /> },
              { path: 'account/addresses', element: <AddressesPage /> },
              { path: 'account/alerts', element: <AlertsPage /> },
              { path: 'account/profile', element: <ProfilePage /> },
              { path: 'orders', element: <OrdersPage /> },
              { path: 'orders/:orderNumber', element: <OrderPage /> },
              { path: 'builds', element: <BuildsPage /> },
            ],
          },
          {
            path: 'admin',
            element: (
              <RequireAuth admin>
                <Outlet />
              </RequireAuth>
            ),
            children: [
              {
                lazy: async () => ({ Component: (await admin()).AdminLayout }),
                children: [
                  { index: true, element: <Navigate to="dashboard" replace /> },
                  { path: 'dashboard', lazy: async () => ({ Component: (await admin()).DashboardPage }) },
                  { path: 'orders', lazy: async () => ({ Component: (await admin()).AdminOrdersPage }) },
                  {
                    path: 'orders/:orderNumber',
                    lazy: async () => ({ Component: (await admin()).AdminOrderPage }),
                  },
                  { path: 'inventory', lazy: async () => ({ Component: (await admin()).InventoryPage }) },
                  { path: 'audit', lazy: async () => ({ Component: (await admin()).AuditPage }) },
                  { path: 'webhooks', lazy: async () => ({ Component: (await admin()).WebhooksPage }) },
                ],
              },
            ],
          },
          {
            path: 'styleguide',
            lazy: async () => ({
              Component: (await import('@/pages/styleguide/StyleguidePage')).StyleguidePage,
            }),
          },
          {
            path: 'how-it-works',
            lazy: async () => ({ Component: (await import('@/pages/how/HowItWorksPage')).HowItWorksPage }),
          },
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
          { path: 'reset-password', element: <ResetPasswordPage /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
