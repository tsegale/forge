import { Cpu, PackageOpen, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { components } from '@/api/schema'
import { ProductCard, ProductCardSkeleton } from '@/components/catalog/ProductCard'
import { SpecTable } from '@/components/catalog/SpecTable'
import { Alert } from '@/components/ui/Alert'
import { Badge, StatusPill } from '@/components/ui/Badge'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Button, IconButton } from '@/components/ui/Button'
import { Dialog, Drawer } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Checkbox, Field, Radio, Select, TextArea } from '@/components/ui/Field'
import { Price } from '@/components/ui/Price'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Rating, RatingInput } from '@/components/ui/Rating'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { Stepper } from '@/components/ui/Stepper'
import { StockIndicator } from '@/components/ui/StockIndicator'
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/toastStore'
import { ApiError } from '@/api/errors'
import { specGroups } from '@/catalog/specs'
import { colorTokens, contrast } from '@/lib/contrast'
import { OrderTimeline } from '@/pages/orders/OrderTimeline'
import tokens from '@/styles/tokens.css?raw'

type Product = components['schemas']['ProductSummary']

const nad = (amount_cents: number) => ({ amount_cents, currency: 'nad' })

const SAMPLE: Product = {
  id: 2,
  sku: 'FRG-CPU-R7-7800X3D',
  slug: 'amd-ryzen-7-7800x3d',
  name: 'AMD Ryzen 7 7800X3D',
  kind: 'cpu',
  brand: { id: 1, name: 'AMD', slug: 'amd' },
  price: nad(749_900),
  availability: { in_stock: true, quantity_available: 18 },
  specs: {
    kind: 'cpu',
    socket_code: 'AM5',
    cores: 8,
    threads: 16,
    base_clock_mhz: 4200,
    boost_clock_mhz: 5000,
    tdp_w: 120,
    max_power_w: 162,
    has_integrated_graphics: true,
    includes_cooler: false,
  },
  compatibility_warnings: null,
  compatibility: null,
}

const SAMPLE_GPU: Product = {
  ...SAMPLE,
  id: 30,
  sku: 'FRG-GPU-MSI-4070S-V2X',
  slug: 'msi-geforce-rtx-4070-super-ventus-2x-oc-12gb',
  name: 'MSI GeForce RTX 4070 SUPER VENTUS 2X OC 12GB',
  kind: 'gpu',
  brand: { id: 4, name: 'MSI', slug: 'msi' },
  price: nad(1_299_900),
  availability: { in_stock: true, quantity_available: 2 },
  specs: {
    kind: 'gpu',
    chipset: 'GeForce RTX 4070 SUPER',
    vram_gb: 12,
    length_mm: 242,
    slot_width: 2,
    tdp_w: 220,
    power_connectors: '1x 16-pin',
    recommended_psu_w: 650,
  },
}

const SECTIONS = [
  ['colour', 'Colour'],
  ['type', 'Typography'],
  ['space', 'Spacing, radius, elevation'],
  ['buttons', 'Buttons'],
  ['forms', 'Form controls'],
  ['status', 'Badges and status'],
  ['commerce', 'Price and stock'],
  ['products', 'Product card and specs'],
  ['navigation', 'Navigation'],
  ['overlays', 'Dialogs, drawers, toasts'],
  ['feedback', 'Loading, empty and error states'],
  ['progress', 'Steppers, timelines, progress'],
] as const

function Section({
  id,
  title,
  children,
  intro,
}: {
  id: string
  title: string
  children: ReactNode
  intro?: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 border-t border-border py-10 first:border-t-0 first:pt-0"
    >
      <h2 id={`${id}-title`} className="text-xl font-semibold text-ink">
        {title}
      </h2>
      {intro ? <p className="mt-1 max-w-3xl text-base text-ink-muted">{intro}</p> : null}
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  )
}

function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold tracking-wide text-ink-subtle uppercase">{label}</p>
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-4">
        {children}
      </div>
    </div>
  )
}

const COLORS = colorTokens(tokens)
const TEXT_ON: [string, string][] = [
  ['ink', 'surface'],
  ['ink-muted', 'surface'],
  ['ink-subtle', 'canvas'],
  ['accent', 'surface'],
  ['success-ink', 'success-soft'],
  ['warning-ink', 'warning-soft'],
  ['danger-ink', 'danger-soft'],
]

function Swatch({ name }: { name: string }) {
  const hex = COLORS[name] ?? '#000000'
  const onWhite = contrast(hex, '#ffffff')
  return (
    <li className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="h-14 border-b border-border" style={{ backgroundColor: hex }} />
      <div className="p-2.5">
        <p className="text-sm font-medium text-ink">{name}</p>
        <p className="font-tech text-xs text-ink-muted">{hex}</p>
        <p className="font-tech text-xs text-ink-subtle">{onWhite.toFixed(2)}:1 on white</p>
      </div>
    </li>
  )
}

/**
 * The Forge design system: tokens and every component in each of its states, rendered with the
 * real components. Linked from "How Forge works".
 */
export function StyleguidePage() {
  const [dialog, setDialog] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [rating, setRating] = useState(4)
  const [step, setStep] = useState('review')

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[13rem_1fr]">
      <nav aria-label="Styleguide sections" className="lg:sticky lg:top-24 lg:self-start">
        <p className="text-xs font-semibold tracking-wide text-ink-subtle uppercase">Design system</p>
        <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 lg:flex-col">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-sm text-ink-muted hover:text-accent hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="min-w-0">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Forge design system</h1>
          <p className="mt-2 max-w-3xl text-md text-ink-muted">
            The tokens and components every page is built from. Colours come straight from the token file, and
            an automated test fails the build if any text or control pairing drops below WCAG 2.1 AA.
          </p>
        </header>

        <Section
          id="colour"
          title="Colour"
          intro="Zinc neutrals, one accent (Forge blue) for primary actions, links and focus, and status colours that carry meaning only."
        >
          {(
            [
              [
                'Neutrals',
                [
                  'canvas',
                  'surface',
                  'surface-muted',
                  'border',
                  'border-strong',
                  'control',
                  'ink',
                  'ink-muted',
                  'ink-subtle',
                ],
              ],
              ['Accent', ['accent', 'accent-hover', 'accent-active', 'accent-soft']],
              [
                'Status',
                [
                  'success',
                  'success-ink',
                  'success-soft',
                  'warning',
                  'warning-ink',
                  'warning-soft',
                  'danger',
                  'danger-ink',
                  'danger-soft',
                ],
              ],
            ] as const
          ).map(([group, names]) => (
            <div key={group}>
              <p className="mb-2 text-xs font-semibold tracking-wide text-ink-subtle uppercase">{group}</p>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {names.map((name) => (
                  <Swatch key={name} name={name} />
                ))}
              </ul>
            </div>
          ))}
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-ink-subtle uppercase">
              Text pairings
            </p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {TEXT_ON.map(([fg, bg]) => (
                <li
                  key={`${fg}-${bg}`}
                  className="rounded-md border border-border p-3"
                  style={{ backgroundColor: COLORS[bg], color: COLORS[fg] }}
                >
                  <p className="text-base font-medium">The quick brown fox</p>
                  <p className="font-tech text-xs">
                    {fg} on {bg}: {contrast(COLORS[fg] ?? '#000000', COLORS[bg] ?? '#ffffff').toFixed(2)}:1
                  </p>
                </li>
              ))}
              <li className="rounded-md bg-accent p-3 text-white">
                <p className="text-base font-medium">White on Forge blue</p>
                <p className="font-tech text-xs">
                  {contrast('#ffffff', COLORS.accent ?? '#000000').toFixed(2)}:1
                </p>
              </li>
            </ul>
          </div>
        </Section>

        <Section
          id="type"
          title="Typography"
          intro="Inter for the interface; JetBrains Mono for SKUs, specifications and technical values, so numbers line up."
        >
          <div className="space-y-3 rounded-md border border-border bg-surface p-5">
            {(
              [
                ['text-4xl', '36 / 44', 'Build the PC you planned'],
                ['text-3xl', '30 / 38', 'Configure your build'],
                ['text-2xl', '24 / 32', 'AMD Ryzen 7 7800X3D'],
                ['text-xl', '20 / 28', 'Section heading'],
                ['text-lg', '18 / 28', 'Card heading'],
                ['text-md', '16 / 24', 'Long-form copy reads at sixteen pixels.'],
                ['text-base', '14 / 22', 'Interface text: labels, table cells, descriptions.'],
                ['text-sm', '13 / 20', 'Secondary text and helper copy.'],
                ['text-xs', '12 / 16', 'Captions, badges and legal notes.'],
              ] as const
            ).map(([cls, metrics, sample]) => (
              <div key={cls} className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <span className="w-28 shrink-0 font-tech text-xs text-ink-subtle">
                  {cls.replace('text-', '')} {metrics}
                </span>
                <span className={`${cls} font-semibold tracking-tight text-ink`}>{sample}</span>
              </div>
            ))}
            <div className="flex flex-wrap items-baseline gap-x-6 border-t border-border pt-3">
              <span className="w-28 shrink-0 font-tech text-xs text-ink-subtle">mono</span>
              <span className="font-tech text-sm text-ink">
                FRG-CPU-R7-7800X3D / AM5 / 8 cores / 5.0 GHz / 120 W
              </span>
            </div>
          </div>
        </Section>

        <Section
          id="space"
          title="Spacing, radius, elevation"
          intro="A 4 px spacing grid, two radii (4 px for inputs and badges, 6 px for cards and buttons), and quiet shadows only for layers above the page."
        >
          <div className="flex flex-wrap items-end gap-4 rounded-md border border-border bg-surface p-5">
            {[1, 2, 3, 4, 6, 8, 10, 12, 16].map((n) => (
              <div key={n} className="flex flex-col items-center gap-1.5">
                <span
                  className="bg-accent-soft"
                  style={{ width: `${String(n * 4)}px`, height: `${String(n * 4)}px` }}
                />
                <span className="font-tech text-xs text-ink-subtle">{n * 4}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div className="flex h-20 items-center justify-center rounded-sm border border-border-strong bg-surface text-sm text-ink-muted">
              radius sm, 4 px
            </div>
            <div className="flex h-20 items-center justify-center rounded-md border border-border-strong bg-surface text-sm text-ink-muted">
              radius md, 6 px
            </div>
            <div className="flex h-20 items-center justify-center rounded-md bg-surface text-sm text-ink-muted shadow-sm">
              shadow sm
            </div>
            <div className="flex h-20 items-center justify-center rounded-md bg-surface text-sm text-ink-muted shadow-md">
              shadow md
            </div>
            <div className="flex h-20 items-center justify-center rounded-md bg-surface text-sm text-ink-muted shadow-lg">
              shadow lg
            </div>
          </div>
        </Section>

        <Section
          id="buttons"
          title="Buttons"
          intro="Every button has hover, focus-visible, active, disabled and loading states. Loading keeps the label for screen readers and sets aria-busy."
        >
          {(['primary', 'secondary', 'ghost', 'danger', 'link'] as const).map((variant) => (
            <Specimen key={variant} label={variant}>
              <Button variant={variant}>Add to cart</Button>
              <Button variant={variant} icon={<ShoppingCart aria-hidden="true" className="h-4 w-4" />}>
                With icon
              </Button>
              <Button variant={variant} busy>
                Saving
              </Button>
              <Button variant={variant} disabled>
                Disabled
              </Button>
              {variant !== 'link' ? (
                <>
                  <Button variant={variant} size="sm">
                    Small
                  </Button>
                  <Button variant={variant} size="lg">
                    Large
                  </Button>
                </>
              ) : null}
            </Specimen>
          ))}
          <Specimen label="Icon buttons">
            <IconButton label="Add part">
              <Plus aria-hidden="true" className="h-4 w-4" />
            </IconButton>
            <IconButton label="Remove part" variant="secondary">
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </IconButton>
            <IconButton label="Remove part" variant="secondary" disabled>
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </IconButton>
          </Specimen>
        </Section>

        <Section
          id="forms"
          title="Form controls"
          intro="Labels are always visible (or hidden only where a visible heading names the field). Errors are inline, announced, and never colour alone."
        >
          <div className="grid grid-cols-1 gap-5 rounded-md border border-border bg-surface p-5 md:grid-cols-2">
            <Field
              label="Email"
              type="email"
              placeholder="you@example.com"
              hint="We send order updates here."
            />
            <Field label="City or town" defaultValue="Windhoek" />
            <Field label="Postal code" optional />
            <Field label="Street address" defaultValue="" error="Enter a street address." />
            <Field label="Disabled" defaultValue="Not editable" disabled />
            <Select label="Sort by" defaultValue="price">
              <option value="relevance">Relevance</option>
              <option value="price">Price: low to high</option>
              <option value="name">Name</option>
            </Select>
            <TextArea label="Review" optional placeholder="What stood out?" className="md:col-span-2" />
            <fieldset className="space-y-2.5">
              <legend className="text-sm font-medium text-ink">Delivery</legend>
              <Radio
                name="sg-delivery"
                label="Courier to address"
                description="2 to 4 working days"
                defaultChecked
              />
              <Radio name="sg-delivery" label="Collect in Windhoek" description="Ready next working day" />
            </fieldset>
            <div className="space-y-2.5">
              <Checkbox label="In stock only" defaultChecked />
              <Checkbox label="Save this address for next time" description="Stored in your account." />
              <Checkbox label="Disabled option" disabled />
            </div>
            <RatingInput value={rating} onChange={setRating} label="Your rating" />
          </div>
        </Section>

        <Section id="status" title="Badges and status">
          <Specimen label="Badges">
            <Badge>Accessory</Badge>
            <Badge tone="accent">New</Badge>
            <Badge tone="success">Compatible</Badge>
            <Badge tone="warning">Power spike risk</Badge>
            <Badge tone="danger">Wrong CPU socket</Badge>
          </Specimen>
          <Specimen label="Status pills">
            <StatusPill tone="warning">Awaiting payment</StatusPill>
            <StatusPill tone="accent">Paid</StatusPill>
            <StatusPill tone="accent">Shipped</StatusPill>
            <StatusPill tone="success">Delivered</StatusPill>
            <StatusPill tone="neutral">Cancelled</StatusPill>
            <StatusPill tone="success">Validated</StatusPill>
            <StatusPill tone="neutral">Draft</StatusPill>
          </Specimen>
          <Rating value={4.4} count={128} />
        </Section>

        <Section
          id="commerce"
          title="Price and stock"
          intro="Prices are always VAT-inclusive Namibian dollars from integer cents."
        >
          <Specimen label="Price">
            <Price price={nad(749_900)} size="sm" />
            <Price price={nad(749_900)} />
            <Price price={nad(749_900)} size="lg" note />
            <Price price={nad(699_900)} was={nad(749_900)} size="lg" />
          </Specimen>
          <Specimen label="Stock">
            <StockIndicator availability={{ in_stock: true, quantity_available: 18 }} />
            <StockIndicator availability={{ in_stock: true, quantity_available: 2 }} />
            <StockIndicator availability={{ in_stock: false, quantity_available: 0 }} />
            <StockIndicator availability={{ in_stock: true, quantity_available: 18 }} detail />
          </Specimen>
        </Section>

        <Section
          id="products"
          title="Product card and specs"
          intro="Fixed-ratio image boxes and matching skeletons, so nothing shifts as photos and data load. Products without a photo show a drawing of their kind."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ProductCard product={SAMPLE} actions={<Button size="sm">Add to cart</Button>} />
            <ProductCard product={SAMPLE_GPU} />
            <ProductCard
              product={{ ...SAMPLE, availability: { in_stock: false, quantity_available: 0 } }}
              dimmed
              note={<Badge tone="danger">Wrong CPU socket</Badge>}
            />
            <ProductCardSkeleton />
          </div>
          <div className="space-y-3">
            <ProductCard
              product={SAMPLE}
              layout="list"
              actions={
                <Button size="sm" variant="secondary">
                  Add to build
                </Button>
              }
            />
            <ProductCardSkeleton layout="list" />
          </div>
          <SpecTable groups={specGroups(SAMPLE.specs)} />
        </Section>

        <Section id="navigation" title="Navigation">
          <Breadcrumbs
            items={[
              { label: 'Catalog', to: '/' },
              { label: 'Processors', to: '/shop/cpu' },
              { label: 'AMD Ryzen 7 7800X3D' },
            ]}
          />
          <Tabs defaultValue="specs">
            <TabList label="Product information">
              <Tab value="specs">Specifications</Tab>
              <Tab value="reviews" count={128}>
                Reviews
              </Tab>
              <Tab value="history">Price history</Tab>
            </TabList>
            <TabPanel value="specs">
              <p className="text-base text-ink-muted">Arrow keys move between tabs.</p>
            </TabPanel>
            <TabPanel value="reviews">
              <p className="text-base text-ink-muted">Reviews panel.</p>
            </TabPanel>
            <TabPanel value="history">
              <p className="text-base text-ink-muted">Price history panel.</p>
            </TabPanel>
          </Tabs>
        </Section>

        <Section
          id="overlays"
          title="Dialogs, drawers, toasts"
          intro="Focus moves into the layer and is trapped there; Escape closes it and focus returns to the trigger."
        >
          <Specimen label="Triggers">
            <Button
              variant="secondary"
              onClick={() => {
                setDialog(true)
              }}
            >
              Open dialog
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDrawer(true)
              }}
            >
              Open drawer
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                toast({ title: 'Added to cart', description: 'AMD Ryzen 7 7800X3D' })
              }}
            >
              Show toast
            </Button>
          </Specimen>
          <Dialog
            open={dialog}
            onOpenChange={setDialog}
            title="Remove from build?"
            description="The part goes back to the catalog; your other parts stay."
            footer={
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDialog(false)
                  }}
                >
                  Keep it
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setDialog(false)
                  }}
                >
                  Remove
                </Button>
              </>
            }
          >
            <p className="text-base text-ink-muted">
              Dialogs are for decisions. Their primary action sits on the right.
            </p>
          </Dialog>
          <Drawer
            open={drawer}
            onOpenChange={setDrawer}
            title="Choose a CPU"
            description="Showing only parts compatible with your build."
            footer={
              <Button
                className="w-full"
                onClick={() => {
                  setDrawer(false)
                }}
              >
                Done
              </Button>
            }
          >
            <ProductCard product={SAMPLE} layout="list" />
          </Drawer>
        </Section>

        <Section id="feedback" title="Loading, empty and error states">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-md border border-border bg-surface p-5">
              <Skeleton className="h-6 w-1/2" />
              <SkeletonText lines={3} />
            </div>
            <div className="space-y-3">
              <Alert tone="info" title="Stock is held for you">
                Your parts are reserved for 15 minutes while you pay.
              </Alert>
              <Alert tone="success" title="Payment received" />
              <Alert tone="warning" title="Power spike risk">
                The graphics card can briefly draw twice its rating.
              </Alert>
              <ErrorMessage
                error={
                  new ApiError(
                    503,
                    'service_unavailable',
                    'The database is temporarily unavailable.',
                    null,
                    '4f1c2a9e',
                  )
                }
                onRetry={() => undefined}
              />
            </div>
          </div>
          <div className="rounded-md border border-border bg-surface">
            <EmptyState
              icon={PackageOpen}
              title="Your cart is empty"
              action={<Button>Browse the catalog</Button>}
            >
              Add parts from the catalog, or start a build and check it out in one go.
            </EmptyState>
          </div>
        </Section>

        <Section id="progress" title="Steppers, timelines, progress">
          <Stepper
            label="Checkout progress"
            steps={[
              { id: 'address', label: 'Address' },
              { id: 'review', label: 'Review' },
              { id: 'payment', label: 'Payment' },
            ]}
            current={step}
            onSelect={setStep}
          />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-md border border-border bg-surface p-5">
              <OrderTimeline
                status="shipped"
                history={[
                  { from_status: null, to_status: 'pending_payment', at: '2026-10-05T09:12:00Z' },
                  { from_status: 'pending_payment', to_status: 'paid', at: '2026-10-05T09:14:00Z' },
                  { from_status: 'paid', to_status: 'fulfilling', at: '2026-10-05T13:30:00Z' },
                  { from_status: 'fulfilling', to_status: 'shipped', at: '2026-10-06T08:05:00Z' },
                ]}
              />
            </div>
            <div className="space-y-5 rounded-md border border-border bg-surface p-5">
              <div>
                <p className="mb-2 text-sm text-ink-muted">N$ 1,200.00 to free shipping</p>
                <ProgressBar
                  value={3800}
                  max={5000}
                  label="Progress to free shipping"
                  valueText="N$ 3,800 of N$ 5,000"
                />
              </div>
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm text-ink-muted">
                  <Cpu aria-hidden="true" className="h-4 w-4" /> Peak draw 520 W of 750 W
                </p>
                <ProgressBar
                  role="meter"
                  tone="success"
                  value={520}
                  max={750}
                  label="Peak power draw"
                  valueText="520 W of 750 W"
                />
              </div>
              <ProgressBar
                role="meter"
                tone="warning"
                value={690}
                max={750}
                label="High load"
                valueText="690 W of 750 W"
              />
              <ProgressBar
                role="meter"
                tone="danger"
                value={820}
                max={750}
                label="Over the rating"
                valueText="820 W of 750 W"
              />
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
