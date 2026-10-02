import { describe, expect, it } from 'vitest'
import { ApiError, toApiError } from './errors'

describe('toApiError', () => {
  it('reads the backend error envelope', () => {
    const error = toApiError(409, {
      error: {
        code: 'insufficient_stock',
        message: 'Some items are no longer available.',
        details: [],
        request_id: 'abc',
      },
    })
    expect(error).toBeInstanceOf(ApiError)
    expect([error.status, error.code, error.requestId]).toEqual([409, 'insufficient_stock', 'abc'])
  })

  it('maps validation details to field errors', () => {
    const error = toApiError(422, {
      error: {
        code: 'validation_failed',
        message: 'The request contains invalid data.',
        details: [{ field: 'email', message: 'value is not a valid email address', type: 'value_error' }],
        request_id: null,
      },
    })
    expect(error.fieldErrors()).toEqual({ email: 'value is not a valid email address' })
  })

  it('never trusts an unexpected body shape', () => {
    const error = toApiError(502, '<html>Bad gateway</html>')
    expect([error.code, error.message]).toEqual([
      'unexpected_response',
      'Something went wrong. Please try again.',
    ])
  })
})
