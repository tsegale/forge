import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppShell } from '@/components/layout/AppShell'
import { CheckoutShell } from '@/components/layout/CheckoutShell'
import { AdminLayout } from '@/pages/admin/AdminLayout'
import { AdminOrderPage } from '@/pages/admin/AdminOrderPage'
import { AdminOrdersPage } from '@/pages/admin/AdminOrdersPage'
import { InventoryPage } from '@/pages/admin/InventoryPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { BuildsPage } from '@/pages/builds/BuildsPage'
import { CartPage } from '@/pages/cart/CartPage'
import { CheckoutPage } from '@/pages/checkout/CheckoutPage'
import { ConfirmationPage } from '@/pages/checkout/ConfirmationPage'
import { PayPage } from '@/pages/checkout/PayPage'
import { CatalogPage } from '@/pages/catalog/CatalogPage'
import { ProductPage } from '@/pages/catalog/ProductPage'
import { ConfiguratorPage } from '@/pages/configurator/ConfiguratorPage'
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
    children: [
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'orders/:orderNumber/pay', element: <PayPage /> },
      { path: 'orders/:orderNumber/confirmation', element: <ConfirmationPage /> },
    ],
  },
  {
    element: <AppShell />,
    children: [
      { index: true, element: <CatalogPage /> },
      { path: 'shop', element: <CatalogPage /> },
      { path: 'shop/:kind', element: <CatalogPage /> },
      { path: 'search', element: <CatalogPage /> },
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
        path: 'orders',
        element: (
          <RequireAuth>
            <OrdersPage />
          </RequireAuth>
        ),
      },
      {
        path: 'orders/:orderNumber',
        element: (
          <RequireAuth>
            <OrderPage />
          </RequireAuth>
        ),
      },
      {
        path: 'admin',
        element: (
          <RequireAuth admin>
            <AdminLayout />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <Navigate to="orders" replace /> },
          { path: 'orders', element: <AdminOrdersPage /> },
          { path: 'orders/:orderNumber', element: <AdminOrderPage /> },
          { path: 'inventory', element: <InventoryPage /> },
        ],
      },
      { path: 'styleguide', element: <StyleguidePage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
