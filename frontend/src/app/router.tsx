import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppShell } from '@/components/layout/AppShell'
import { CheckoutShell } from '@/components/layout/CheckoutShell'
import { AccountLayout } from '@/pages/account/AccountLayout'
import { AccountOverview } from '@/pages/account/AccountOverview'
import { AddressesPage } from '@/pages/account/AddressesPage'
import { AlertsPage } from '@/pages/account/AlertsPage'
import { ProfilePage } from '@/pages/account/ProfilePage'
import { AdminLayout } from '@/pages/admin/AdminLayout'
import { AdminOrderPage } from '@/pages/admin/AdminOrderPage'
import { AdminOrdersPage } from '@/pages/admin/AdminOrdersPage'
import { AuditPage } from '@/pages/admin/AuditPage'
import { DashboardPage } from '@/pages/admin/DashboardPage'
import { InventoryPage } from '@/pages/admin/InventoryPage'
import { WebhooksPage } from '@/pages/admin/WebhooksPage'
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
import { HowItWorksPage } from '@/pages/how/HowItWorksPage'
import { NotFound } from '@/pages/NotFound'
import { OrderPage } from '@/pages/orders/OrderPage'
import { OrdersPage } from '@/pages/orders/OrdersPage'
import { StyleguidePage } from '@/pages/styleguide/StyleguidePage'

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
          { index: true, element: <HomePage /> },
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
                <AdminLayout />
              </RequireAuth>
            ),
            children: [
              { index: true, element: <Navigate to="dashboard" replace /> },
              { path: 'dashboard', element: <DashboardPage /> },
              { path: 'orders', element: <AdminOrdersPage /> },
              { path: 'orders/:orderNumber', element: <AdminOrderPage /> },
              { path: 'inventory', element: <InventoryPage /> },
              { path: 'audit', element: <AuditPage /> },
              { path: 'webhooks', element: <WebhooksPage /> },
            ],
          },
          { path: 'styleguide', element: <StyleguidePage /> },
          { path: 'how-it-works', element: <HowItWorksPage /> },
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
