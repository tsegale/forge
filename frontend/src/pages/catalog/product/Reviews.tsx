import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { BadgeCheck, MessageSquareText } from 'lucide-react'
import { useState, type SyntheticEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/context'
import {
  myReviewQuery,
  reviewsQuery,
  useDeleteReview,
  useSaveReview,
  type Review,
  type ReviewSort,
} from '@/catalog/reviews'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Checkbox, Field, Select, TextArea } from '@/components/ui/Field'
import { Rating, RatingInput } from '@/components/ui/Rating'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toastStore'

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

function Distribution({ counts, total }: { counts: Record<string, number>; total: number }) {
  return (
    <dl className="flex flex-col gap-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const n = counts[String(star)] ?? 0
        const share = total ? n / total : 0
        return (
          <div key={star} className="grid grid-cols-[3.5rem_1fr_2rem] items-center gap-3 text-sm">
            <dt className="text-ink-muted">{star} stars</dt>
            <dd className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <span
                className="block h-full rounded-full bg-warning"
                style={{ width: `${String(share * 100)}%` }}
              />
            </dd>
            <dd className="text-right text-ink-subtle tabular">{n}</dd>
          </div>
        )
      })}
    </dl>
  )
}

function ReviewItem({ review }: { review: Review }) {
  return (
    <article className="border-b border-border py-5 last:border-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Rating value={review.rating} />
        {review.title ? <h3 className="text-base font-semibold text-ink">{review.title}</h3> : null}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-subtle">
        <span>{review.author}</span>
        <span aria-hidden="true">/</span>
        <time dateTime={review.created_at}>{DAY.format(new Date(review.created_at))}</time>
        {review.is_verified_purchase ? (
          <Badge tone="success">
            <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" /> Verified purchase
          </Badge>
        ) : null}
      </p>
      <p className="mt-2 max-w-prose text-base whitespace-pre-line text-ink">{review.body}</p>
    </article>
  )
}

function ReviewForm({
  slug,
  existing,
  onDone,
}: {
  slug: string
  existing: Review | null
  onDone: () => void
}) {
  const [rating, setRating] = useState(existing?.rating ?? 0)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [body, setBody] = useState(existing?.body ?? '')
  const [problem, setProblem] = useState<string | undefined>()
  const save = useSaveReview(slug, existing)
  const remove = useDeleteReview(slug)
  const fieldError = (name: string) =>
    save.error instanceof ApiError && Array.isArray(save.error.details)
      ? (save.error.details as { field: string; message: string }[]).find((d) => d.field === name)?.message
      : undefined

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (rating < 1) {
      setProblem('Choose a rating from 1 to 5 stars.')
      return
    }
    if (body.trim().length < 10) {
      setProblem('Write at least 10 characters about the part.')
      return
    }
    setProblem(undefined)
    save.mutate(
      { rating, title: title.trim() || null, body: body.trim() },
      {
        onSuccess: () => {
          toast({ title: existing ? 'Review updated' : 'Thanks for your review' })
          onDone()
        },
      },
    )
  }

  return (
    <form id="review-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
      <RatingInput value={rating} onChange={setRating} label="Your rating" />
      <Field
        label="Title"
        optional
        maxLength={120}
        value={title}
        error={fieldError('title')}
        onChange={(event) => {
          setTitle(event.target.value)
        }}
      />
      <TextArea
        label="Your review"
        hint="What did you build with it, and how has it performed? At least 10 characters."
        rows={5}
        maxLength={5000}
        value={body}
        error={fieldError('body')}
        onChange={(event) => {
          setBody(event.target.value)
        }}
      />
      {problem ? (
        <p role="alert" className="text-sm text-danger-ink">
          {problem}
        </p>
      ) : null}
      {save.error && !fieldError('title') && !fieldError('body') ? <ErrorMessage error={save.error} /> : null}
      <div className="flex flex-wrap justify-between gap-3">
        {existing ? (
          <Button
            variant="ghost"
            className="text-danger-ink"
            busy={remove.isPending}
            onClick={() => {
              remove.mutate(existing.id, {
                onSuccess: () => {
                  toast({ title: 'Review deleted', tone: 'info' })
                  onDone()
                },
              })
            }}
          >
            Delete review
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" busy={save.isPending}>
          {existing ? 'Save changes' : 'Post review'}
        </Button>
      </div>
    </form>
  )
}

/** Ratings summary, the reviews themselves (sortable, verified only), and writing your own. */
export function Reviews({ slug, productName }: { slug: string; productName: string }) {
  const { user } = useAuth()
  const location = useLocation()
  const [sort, setSort] = useState<ReviewSort>('newest')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [writing, setWriting] = useState(false)
  const reviews = useInfiniteQuery(reviewsQuery(slug, sort, verifiedOnly))
  const mine = useQuery(myReviewQuery(slug, user?.id))

  const summary = reviews.data?.pages[0]?.summary
  const items = reviews.data?.pages.flatMap((page) => page.items) ?? []
  const writeButton = user ? (
    <Button
      variant="secondary"
      disabled={mine.isPending}
      onClick={() => {
        setWriting(true)
      }}
    >
      {mine.data ? 'Edit your review' : 'Write a review'}
    </Button>
  ) : (
    <Button variant="secondary" asChild>
      <Link to={`/login?next=${encodeURIComponent(`${location.pathname}#reviews`)}`}>
        Sign in to write a review
      </Link>
    </Button>
  )

  if (reviews.isError) return <ErrorMessage error={reviews.error} onRetry={() => void reviews.refetch()} />
  if (!summary) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[18rem_1fr]">
      <div className="flex flex-col gap-4">
        {summary.count ? (
          <>
            <div>
              <p className="text-4xl font-semibold tracking-tight text-ink tabular">
                {summary.average?.toFixed(1)}
                <span className="text-lg font-normal text-ink-subtle"> / 5</span>
              </p>
              <Rating value={summary.average ?? 0} size="md" className="mt-1" />
              <p className="mt-1 text-sm text-ink-muted">
                {summary.count} {summary.count === 1 ? 'review' : 'reviews'}
              </p>
            </div>
            <Distribution counts={summary.counts} total={summary.count} />
          </>
        ) : null}
        <div>{writeButton}</div>
      </div>

      <div>
        {summary.count ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
              <Checkbox
                label="Verified purchases only"
                checked={verifiedOnly}
                onChange={(event) => {
                  setVerifiedOnly(event.target.checked)
                }}
              />
              <Select
                label="Sort reviews"
                hideLabel
                className="w-44"
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as ReviewSort)
                }}
              >
                <option value="newest">Newest first</option>
                <option value="highest">Highest rated</option>
                <option value="lowest">Lowest rated</option>
              </Select>
            </div>
            {items.length ? (
              <div aria-live="polite">
                {items.map((review) => (
                  <ReviewItem key={review.id} review={review} />
                ))}
              </div>
            ) : (
              <p className="py-6 text-base text-ink-muted">No verified-purchase reviews yet.</p>
            )}
            {reviews.hasNextPage ? (
              <Button
                variant="secondary"
                className="mt-4"
                busy={reviews.isFetchingNextPage}
                onClick={() => void reviews.fetchNextPage()}
              >
                Show more reviews
              </Button>
            ) : null}
          </>
        ) : (
          <EmptyState icon={MessageSquareText} title="No reviews yet" className="py-8">
            <p>Bought this part? Tell other builders how it went.</p>
          </EmptyState>
        )}
      </div>

      <Dialog
        open={writing}
        onOpenChange={setWriting}
        title={mine.data ? 'Edit your review' : 'Write a review'}
        description={productName}
      >
        {writing ? (
          <ReviewForm
            slug={slug}
            existing={mine.data ?? null}
            onDone={() => {
              setWriting(false)
            }}
          />
        ) : null}
      </Dialog>
    </div>
  )
}
