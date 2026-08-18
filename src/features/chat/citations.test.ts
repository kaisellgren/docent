import { describe, expect, it } from 'vitest'
import { citedNumbers, removeCitations } from './citations'

describe('citation markers', () => {
  it('extracts numbers from grouped and separate markers', () => {
    expect([...citedNumbers('Answer [1, 2] and [4]')]).toEqual([1, 2, 4])
  })

  it('removes grouped markers when all citations were persisted', () => {
    expect(removeCitations('Answer [1, 2] and [4]', new Set([1, 2, 4]))).toBe('Answer  and ')
  })

  it('keeps markers that do not have a matching citation', () => {
    expect(removeCitations('Answer [1, 2]', new Set([1]))).toBe('Answer [1, 2]')
  })
})
