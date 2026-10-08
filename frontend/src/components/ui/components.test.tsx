import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { keySpecs, specGroups } from '@/catalog/specs'
import { PHOTOS } from '@/lib/photos'
import { Breadcrumbs } from './Breadcrumbs'
import { Button, IconButton } from './Button'
import { Field } from './Field'
import { Photo } from './Photo'
import { Price } from './Price'
import { ProgressBar } from './ProgressBar'
import { Rating } from './Rating'
import { Stepper } from './Stepper'
import { StockIndicator } from './StockIndicator'
import { Toaster } from './Toast'
import { toast } from './toastStore'

const nad = (amount_cents: number) => ({ amount_cents, currency: 'nad' })

describe('Button', () => {
  it('is a non-submitting button by default and blocks clicks while busy', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('type', 'button')
    rerender(
      <Button busy onClick={onClick}>
        Save
      </Button>,
    )
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('names icon-only buttons by their label', () => {
    render(<IconButton label="Remove part">x</IconButton>)
    expect(screen.getByRole('button', { name: 'Remove part' })).toBeInTheDocument()
  })
})

describe('Field', () => {
  it('ties the error and hint to the input and marks it invalid', () => {
    render(<Field label="City" hint="Where we deliver" error="Enter a city." />)
    const input = screen.getByLabelText('City')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Enter a city. Where we deliver')
  })

  it('marks optional fields in the label', () => {
    render(<Field label="Postal code" optional />)
    expect(screen.getByLabelText('Postal code (optional)')).toBeInTheDocument()
  })
})

describe('commerce primitives', () => {
  it('formats a price with its previous price for screen readers too', () => {
    render(<Price price={nad(699_900)} was={nad(749_900)} note />)
    expect(screen.getByText('N$ 6,999.00')).toBeInTheDocument()
    expect(screen.getByText('N$ 7,499.00').tagName).toBe('S')
    expect(screen.getByText(', down from')).toBeInTheDocument()
    expect(screen.getByText('VAT included')).toBeInTheDocument()
  })

  it.each([
    [{ in_stock: true, quantity_available: 18 }, 'In stock'],
    [{ in_stock: true, quantity_available: 2 }, 'Only 2 left'],
    [{ in_stock: false, quantity_available: 0 }, 'Out of stock'],
  ])('shows stock %o as %s', (availability, text) => {
    render(<StockIndicator availability={availability} />)
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('exposes a meter value as text', () => {
    render(
      <ProgressBar role="meter" value={520} max={750} label="Peak power draw" valueText="520 W of 750 W" />,
    )
    const meter = screen.getByRole('meter', { name: 'Peak power draw' })
    expect(meter).toHaveAttribute('aria-valuetext', '520 W of 750 W')
    expect(meter).toHaveAttribute('aria-valuenow', '520')
  })

  it('reads a rating aloud', () => {
    render(<Rating value={4.4} count={128} />)
    expect(screen.getByText('4.4 out of 5')).toBeInTheDocument()
  })
})

describe('navigation', () => {
  it('marks the current page in breadcrumbs, which is not a link', () => {
    render(
      <MemoryRouter>
        <Breadcrumbs items={[{ label: 'Catalog', to: '/' }, { label: 'AMD Ryzen 7 7800X3D' }]} />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('link', { name: 'Catalog' })).toHaveAttribute('href', '/')
    expect(within(nav).getByText('AMD Ryzen 7 7800X3D')).toHaveAttribute('aria-current', 'page')
  })

  it('marks the current step and lets completed steps be revisited', async () => {
    const onSelect = vi.fn()
    render(
      <Stepper
        label="Checkout progress"
        steps={[
          { id: 'address', label: 'Address' },
          { id: 'review', label: 'Review' },
          { id: 'payment', label: 'Payment' },
        ]}
        current="review"
        onSelect={onSelect}
      />,
    )
    const nav = screen.getByRole('navigation', { name: 'Checkout progress' })
    expect(within(nav).getByText('Step 2 of 3:')).toBeInTheDocument()
    const current = within(nav)
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('aria-current') === 'step')
    expect(current).toHaveTextContent('Review')
    await userEvent.click(within(nav).getByRole('button', { name: /Address/ }))
    expect(onSelect).toHaveBeenCalledWith('address')
    expect(within(nav).queryByRole('button', { name: /Payment/ })).not.toBeInTheDocument()
  })
})

describe('toasts', () => {
  it('announces a toast raised from anywhere', async () => {
    render(<Toaster />)
    toast({ title: 'Added to cart', description: 'AMD Ryzen 7 7800X3D' })
    expect(await screen.findByText('Added to cart')).toBeInTheDocument()
    expect(screen.getByText('AMD Ryzen 7 7800X3D')).toBeInTheDocument()
  })
})

describe('spec helpers', () => {
  const cpu = {
    kind: 'cpu' as const,
    socket_code: 'AM5',
    cores: 8,
    threads: 16,
    base_clock_mhz: 4200,
    boost_clock_mhz: 5000,
    tdp_w: 120,
    max_power_w: 162,
    has_integrated_graphics: true,
    includes_cooler: false,
  }

  it('summarises the facts that decide a part', () => {
    expect(keySpecs(cpu)).toEqual(['AM5', '8 cores', '5.0 GHz boost', '120 W'])
  })

  it('groups specifications for the product page, keeping every field', () => {
    const groups = specGroups(cpu)
    expect(groups.map((g) => g.title)).toEqual(['Platform', 'Performance', 'Power'])
    expect(groups.flatMap((g) => g.rows)).toHaveLength(9)
    expect(groups[0]?.rows[0]).toEqual({ label: 'Socket', value: 'AM5' })
  })
})

describe('Photo', () => {
  it('reserves its box, offers every width and loads lazily unless it is the priority image', () => {
    const { container, rerender } = render(<Photo photo={PHOTOS.emptyCart} sizes="400px" />)
    const img = screen.getByRole('img', { name: PHOTOS.emptyCart.alt })
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('srcset', PHOTOS.emptyCart.srcSet)
    expect(img).toHaveAttribute('sizes', '400px')
    expect(img).toHaveAttribute('width', String(PHOTOS.emptyCart.width))
    expect(img).toHaveAttribute('height', String(PHOTOS.emptyCart.height))
    expect(container.firstElementChild).toHaveStyle({ aspectRatio: '3 / 2' })

    rerender(<Photo photo={PHOTOS.emptyCart} sizes="400px" priority />)
    expect(img).toHaveAttribute('loading', 'eager')
    expect(img).toHaveAttribute('fetchpriority', 'high')
  })
})
