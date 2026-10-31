import { describe, expect, it } from 'vitest'
import { greeting } from '../greeting'

describe('greeting', () => {
  it.each([
    [0, 'Good evening'],
    [4, 'Good evening'],
    [5, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
  ])('at %i:00 says "%s"', (hour, expected) => {
    expect(greeting(hour)).toBe(expected)
  })

  it('adds the name, tidied, when there is one', () => {
    expect(greeting(8, 'Sam')).toBe('Good morning, Sam')
    expect(greeting(14, '  Sam   Lee ')).toBe('Good afternoon, Sam Lee')
    expect(greeting(20, '   ')).toBe('Good evening')
  })
})
