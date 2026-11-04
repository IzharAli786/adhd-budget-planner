import { describe, expect, it } from 'vitest'
import { DISPLAY_NAME_MAX, greeting } from '../greeting'

describe('greeting', () => {
  it('says "Hi" with the name', () => {
    expect(greeting('Sam')).toBe('Hi Sam')
  })

  it('tidies spaces and keeps it to one line', () => {
    expect(greeting('  Sam   Lee ')).toBe('Hi Sam Lee')
    expect(greeting('x'.repeat(60))).toBe(`Hi ${'x'.repeat(DISPLAY_NAME_MAX)}`)
  })

  it('says "Hi there" when no name is set', () => {
    expect(greeting()).toBe('Hi there')
    expect(greeting('   ')).toBe('Hi there')
  })
})
