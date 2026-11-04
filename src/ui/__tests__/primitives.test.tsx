// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Badge } from '../Badge'
import { BUTTON_ICON_SIZE, Button, buttonClass, textLinkClass } from '../Button'
import { Checkbox, CheckboxMark, radioClass } from '../Checkbox'
import { Chip } from '../Chip'
import { DATA_COLOR, tint } from '../dataColors'
import { EnvelopeLabel } from '../EnvelopeDot'
import { Field, FieldError, inputClass } from '../Field'
import { Icon, strokeFor } from '../Icon'
import { IconButton, iconButtonClass } from '../IconButton'
import { IconTile } from '../IconTile'
import { Logo } from '../Logo'
import { Marker } from '../Marker'
import { Notice } from '../Notice'
import { ProgressBar, ProgressRing } from '../Progress'
import { Segmented, segmentItemClass } from '../Segmented'
import { BILL_STATUS, GOAL_STATUS, StatusBadge, TAG } from '../status'
import { Switch } from '../Switch'

afterEach(cleanup)

const glyph = (el: Element) => el.querySelector('svg')
const isChecked = (el: HTMLElement) => (el as HTMLInputElement).checked

describe('Badge and StatusBadge', () => {
  it('renders exactly its label, with an aria-hidden glyph', () => {
    render(
      <Badge tone="progress" icon="circleHalf">
        In progress
      </Badge>,
    )
    const badge = screen.getByText('In progress')
    expect(badge.textContent).toBe('In progress')
    expect(badge.tagName).toBe('SPAN')
    expect(glyph(badge)?.getAttribute('aria-hidden')).toBe('true')
    expect(badge.className).toMatch(/bg-tone-progress-bg/)
    expect(badge.className).toMatch(/text-tone-progress\b/)
  })

  it('is not interactive', () => {
    render(<Badge>Main</Badge>)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Main').className).toMatch(/bg-tone-neutral-bg/)
  })

  it.each([
    [GOAL_STATUS.todo, 'Not started', 'neutral'],
    [GOAL_STATUS.doing, 'In progress', 'progress'],
    [GOAL_STATUS.done, 'Done', 'success'],
    [BILL_STATUS.overdue, 'Overdue', 'attention'],
    [BILL_STATUS.paid, 'Paid', 'success'],
    [BILL_STATUS.skipped, 'Skipped', 'neutral'],
    [BILL_STATUS.autopay, 'Autopay', 'info'],
    [BILL_STATUS.debtMinimum, 'Debt minimum', 'neutral'],
    [TAG.focusFirst, 'Focus first', 'info'],
    [TAG.paidOff, 'Paid off', 'success'],
  ])('StatusBadge %#: "%s"', (status, label, tone) => {
    render(<StatusBadge status={status} />)
    const badge = screen.getByText(label)
    expect(badge.textContent).toBe(label)
    expect(badge.className).toMatch(new RegExp(`bg-tone-${tone}-bg`))
    // Every status with a glyph shows it: colour is never the only signal.
    expect(Boolean(glyph(badge))).toBe(Boolean(status.icon))
  })

  it('StatusBadge can drop its glyph when a disc beside it already shows it', () => {
    render(<StatusBadge status={GOAL_STATUS.doing} icon={false} size="md" />)
    const badge = screen.getByText('In progress')
    expect(glyph(badge)).toBeNull()
    expect(badge.className).toMatch(/\bh-7\b/)
  })

  it('every status carries a word, and every bill status a glyph', () => {
    for (const s of [...Object.values(GOAL_STATUS), ...Object.values(BILL_STATUS)]) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.icon).toBeTruthy()
    }
  })
})

describe('Checkbox', () => {
  function Harness({ initial = false, indeterminate = false }) {
    const [checked, setChecked] = useState(initial)
    return (
      <Checkbox
        checked={checked}
        indeterminate={indeterminate}
        onCheckedChange={setChecked}
        tone="success"
      >
        Rent paid
      </Checkbox>
    )
  }

  it('is a native checkbox named by its label, toggled by click and Space', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const box = screen.getByRole('checkbox', { name: 'Rent paid' })
    expect(isChecked(box)).toBe(false)
    await user.click(box)
    expect(isChecked(box)).toBe(true)
    // The check glyph appears only when checked.
    expect(box.parentElement?.querySelector('svg')).not.toBeNull()
    box.focus()
    await user.keyboard(' ')
    expect(isChecked(box)).toBe(false)
    expect(box.parentElement?.querySelector('svg')).toBeNull()
  })

  it('clicking the visible label toggles it (44px target, not just the 20px box)', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('Rent paid'))
    expect(isChecked(screen.getByRole('checkbox'))).toBe(true)
  })

  it('takes an aria-label when it has no visible label', () => {
    const onChange = vi.fn()
    render(<Checkbox checked aria-label="Rent, due today" onCheckedChange={onChange} />)
    const box = screen.getByRole('checkbox', { name: 'Rent, due today' })
    expect(isChecked(box)).toBe(true)
    fireEvent.click(box)
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('says "mixed" when indeterminate', () => {
    render(<Harness indeterminate />)
    const box = screen.getByRole('checkbox') as HTMLInputElement
    expect(box.getAttribute('aria-checked')).toBe('mixed')
    expect(box.indeterminate).toBe(true)
  })

  it('has no aria-checked override when it is plainly on or off', () => {
    render(<Harness initial />)
    expect(screen.getByRole('checkbox').hasAttribute('aria-checked')).toBe(false)
  })

  it('CheckboxMark is decorative and shows a tick only when checked', () => {
    const { container, rerender } = render(<CheckboxMark checked={false} tone="success" />)
    const mark = container.firstElementChild!
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    expect(mark.querySelector('svg')).toBeNull()
    expect(mark.className).toMatch(/ring-control/)
    rerender(<CheckboxMark checked tone="success" />)
    expect(container.firstElementChild!.querySelector('svg')).not.toBeNull()
    expect(container.firstElementChild!.className).toMatch(/bg-tone-success/)
  })

  it('radioClass draws a ring that fills to a dot', () => {
    expect(radioClass).toMatch(/appearance-none/)
    expect(radioClass).toMatch(/checked:ring-\[6px\]/)
  })
})

describe('IconButton', () => {
  it('requires a label and uses it as the accessible name', () => {
    const onClick = vi.fn()
    render(<IconButton icon="close" label="Dismiss" onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'Dismiss' })
    expect(button.getAttribute('aria-label')).toBe('Dismiss')
    expect(button.getAttribute('type')).toBe('button')
    expect(button.className).toMatch(/\bsize-11\b/)
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('sizes the glyph 18 (sm) or 20 (md); the target stays 44px', () => {
    render(
      <>
        <IconButton icon="edit" label="Edit" size="sm" />
        <IconButton icon="chevron" label="Next month" />
      </>,
    )
    expect(glyph(screen.getByRole('button', { name: 'Edit' }))?.getAttribute('width')).toBe('18')
    expect(glyph(screen.getByRole('button', { name: 'Next month' }))?.getAttribute('width')).toBe(
      '20',
    )
  })

  it('stays focusable when aria-disabled (period arrows at the end of the range)', () => {
    render(<IconButton icon="back" label="Previous year" aria-disabled />)
    const button = screen.getByRole('button', { name: 'Previous year' })
    button.focus()
    expect(document.activeElement).toBe(button)
    expect(button.getAttribute('aria-disabled')).toBe('true')
  })

  it('has one class recipe per tone', () => {
    expect(iconButtonClass('danger')).toMatch(/hover:text-tone-attention/)
    expect(iconButtonClass('inverse')).toMatch(/text-bg\/80/)
    expect(iconButtonClass()).toMatch(/text-muted/)
  })
})

describe('Icon', () => {
  it.each(['more', 'circleHalf'] as const)('%s draws a solid fill layer', (name) => {
    const { container } = render(<Icon name={name} />)
    const filled = [...container.querySelectorAll('path')].filter(
      (p) => p.getAttribute('fill') === 'currentColor',
    )
    expect(filled).toHaveLength(1)
  })

  it('more is fill-only: no empty stroke path', () => {
    const { container } = render(<Icon name="more" />)
    expect(container.querySelectorAll('path')).toHaveLength(1)
  })

  it('keeps a constant rendered stroke across sizes', () => {
    // 1.5px at 16-22, 1.25px at 14 and below; bold 2px (1.75px small).
    expect((strokeFor(22, 'regular') * 22) / 24).toBeCloseTo(1.5)
    expect((strokeFor(16, 'regular') * 16) / 24).toBeCloseTo(1.5)
    expect((strokeFor(12, 'regular') * 12) / 24).toBeCloseTo(1.25)
    expect((strokeFor(20, 'bold') * 20) / 24).toBeCloseTo(2)
    expect((strokeFor(14, 'bold') * 14) / 24).toBeCloseTo(1.75)
    const { container } = render(<Icon name="check" size={14} weight="bold" />)
    expect(Number(container.querySelector('svg')?.getAttribute('stroke-width'))).toBeCloseTo(3)
  })

  it('is decorative', () => {
    const { container } = render(<Icon name="alert" size={16} />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('Button', () => {
  it('keeps the positional buttonClass(variant, size, block) of every older call', () => {
    expect(buttonClass()).toMatch(/bg-accent/)
    expect(buttonClass('ghost', 'lg', true)).toMatch(/\bw-full\b/)
    expect(buttonClass('ghost', 'lg', true)).toMatch(/min-h-13/)
    expect(buttonClass('secondary')).toMatch(/ring-line/)
  })

  it('swaps in the compact padding for text and quiet (never both paddings)', () => {
    const text = buttonClass('text', 'sm').split(' ')
    expect(text).toContain('px-2.5')
    expect(text).not.toContain('px-3.5')
    expect(buttonClass('quiet', 'md').split(' ')).toContain('px-3')
  })

  it('bleeds by its own padding', () => {
    expect(buttonClass('text', 'sm', false, true).split(' ')).toContain('-mx-2.5')
    expect(buttonClass('primary', 'md', false, true).split(' ')).toContain('-mx-5')
  })

  it('shows a disabled primary as a readable neutral slab, not a faded accent', () => {
    expect(buttonClass('primary')).toMatch(/disabled:bg-tone-neutral-bg/)
    expect(buttonClass('primary')).not.toMatch(/disabled:opacity/)
  })

  it('renders leading and trailing icons at the size for the button size', () => {
    render(
      <Button variant="pill" size="sm" iconEnd="chevron">
        Open calendar
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Open calendar' })
    expect(button.textContent).toBe('Open calendar')
    expect(glyph(button)?.getAttribute('width')).toBe(String(BUTTON_ICON_SIZE.sm))
    expect(button.lastElementChild?.tagName.toLowerCase()).toBe('svg')
  })

  it('danger is the attention tone with a trash glyph by convention', () => {
    render(
      <Button variant="danger" icon="trash">
        Erase everything…
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Erase everything…' })
    expect(button.className).toMatch(/text-tone-attention/)
    expect(button.firstElementChild?.tagName.toLowerCase()).toBe('svg')
  })

  it('textLinkClass underlines, because accent and muted are too close to tell apart', () => {
    expect(textLinkClass).toMatch(/\bunderline\b/)
  })
})

describe('Switch', () => {
  function Harness() {
    const [on, setOn] = useState(false)
    return <Switch checked={on} onChange={setOn} label="Large text" />
  }

  it('is a switch that toggles and shows a tick knob when on', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const sw = screen.getByRole('switch', { name: 'Large text' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(sw.querySelector('svg')).toBeNull()
    await user.click(sw)
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(sw.querySelector('svg')).not.toBeNull()
    await user.keyboard(' ')
    expect(sw.getAttribute('aria-checked')).toBe('false')
  })
})

describe('Segmented and Chip', () => {
  it('segmentItemClass lifts the selected option with a control edge and semibold', () => {
    expect(segmentItemClass(true)).toMatch(/bg-selected/)
    expect(segmentItemClass(true)).toMatch(/ring-control/)
    expect(segmentItemClass(true)).toMatch(/font-semibold/)
    expect(segmentItemClass(false)).not.toMatch(/ring-/)
  })

  it('Segmented uses it', () => {
    render(
      <Segmented
        label="Kind"
        value="spent"
        options={[
          { value: 'spent', label: 'Spent' },
          { value: 'got', label: 'Got money' },
        ]}
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('radio', { name: 'Spent' }).className).toBe(segmentItemClass(true))
  })

  it('a selected Chip swaps its leading mark for a tick; the name stays the label', () => {
    const { rerender } = render(
      <Chip selected={false} leading={<span data-testid="dot" aria-hidden="true" />}>
        Groceries
      </Chip>,
    )
    const chip = screen.getByRole('button', { name: 'Groceries' })
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('dot')).toBeTruthy()
    rerender(
      <Chip selected leading={<span data-testid="dot" aria-hidden="true" />}>
        Groceries
      </Chip>,
    )
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByTestId('dot')).toBeNull()
    expect(chip.querySelector('svg')).not.toBeNull()
    expect(chip.className).toMatch(/bg-accent-soft/)
    expect(chip.className).not.toMatch(/bg-accent\b(?!-)/)
  })
})

describe('Notice, IconTile, Marker, Logo', () => {
  it('Notice takes a role and a default glyph by tone', () => {
    render(
      <Notice tone="attention" role="alert">
        Couldn’t make the PDF.
      </Notice>,
    )
    const notice = screen.getByRole('alert')
    expect(notice.textContent).toBe('Couldn’t make the PDF.')
    expect(notice.className).toMatch(/bg-tone-attention-bg/)
    expect(notice.querySelector('svg')).not.toBeNull()
  })

  it('Notice puts its action on the right', () => {
    render(
      <Notice tone="success" action={<IconButton icon="close" label="Dismiss" size="sm" />}>
        Works offline.
      </Notice>,
    )
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy()
  })

  it('IconTile is decorative and tone-filled', () => {
    const { container } = render(<IconTile icon="shield" tone="success" size="md" />)
    const tile = container.firstElementChild!
    expect(tile.getAttribute('aria-hidden')).toBe('true')
    expect(tile.className).toMatch(/bg-tone-success-bg/)
    expect(tile.className).toMatch(/\bsize-11\b/)
    expect(tile.querySelector('svg')?.getAttribute('width')).toBe('20')
  })

  it.each([
    ['bill', false, false, /bg-accent/],
    ['bill', true, false, /bg-control/],
    ['debt', true, false, /bg-control/],
    ['debt', false, false, /rotate-45/],
    ['payday', false, false, /border-\(--env-sage\)/],
    ['payday', false, true, /border-accent-contrast/],
    ['note', false, true, /bg-accent-contrast/],
  ] as const)('Marker %s (paid %s, inverse %s)', (kind, paid, inverse, want) => {
    const { container } = render(<Marker kind={kind} paid={paid} inverse={inverse} size="md" />)
    const mark = container.firstElementChild!
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    expect(mark.className).toMatch(want)
  })

  it('Logo follows the theme colours', () => {
    const { container } = render(<Logo size={32} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelector('rect')?.getAttribute('style')).toMatch(/var\(--accent\)/)
  })
})

describe('Field, EnvelopeLabel, Progress, data colours', () => {
  it('a field error reads as an error without colour: glyph, words, wired by id', () => {
    render(
      <Field id="amt" label="Amount" error="Enter an amount above zero.">
        <input id="amt" aria-describedby="amt-error" aria-invalid className={inputClass} />
      </Field>,
    )
    const input = screen.getByRole('textbox', { name: 'Amount' })
    const error = document.getElementById(input.getAttribute('aria-describedby')!)!
    expect(error.textContent).toBe('Enter an amount above zero.')
    expect(error.className).toMatch(/text-tone-attention/)
    expect(error.querySelector('svg')).not.toBeNull()
  })

  it('inputClass has no dead focus ring utilities', () => {
    expect(inputClass).not.toMatch(/focus:ring/)
    expect(inputClass).toMatch(/aria-invalid:border-tone-attention/)
  })

  // --line is decorative (about 1.1-1.4:1); a field's edge is what makes it findable, so it
  // takes the control edge, which contrast.test.ts holds to 3:1 on surface and bg.
  it('inputClass draws the edge in the control colour, not the decorative line', () => {
    const classes = inputClass.split(/\s+/)
    expect(classes).toContain('border-control')
    expect(classes).not.toContain('border-line')
  })

  it('FieldError renders on its own', () => {
    render(<FieldError id="e">Too long.</FieldError>)
    expect(screen.getByText('Too long.').closest('p')?.id).toBe('e')
  })

  it('EnvelopeLabel shares the badge geometry', () => {
    render(<EnvelopeLabel name="Groceries" color="sage" />)
    const label = screen.getByText('Groceries').parentElement!
    expect(label.className).toMatch(/\bh-6\b/)
    expect(label.className).toMatch(/bg-tone-neutral-bg/)
  })

  it('ProgressBar takes a size, a fill colour and a track colour', () => {
    render(
      <>
        <ProgressBar value={0.5} label="Food used" />
        <ProgressBar
          value={2}
          label="Card paid off"
          size="md"
          color={DATA_COLOR.debt}
          // happy-dom drops color-mix() from inline styles, so a plain colour stands in.
          trackColor="#eeeeee"
        />
      </>,
    )
    const sm = screen.getByRole('progressbar', { name: 'Food used' })
    expect(sm.className).toMatch(/\bh-2\b/)
    expect(sm.className).toMatch(/bg-track/)
    const md = screen.getByRole('progressbar', { name: 'Card paid off' })
    expect(md.getAttribute('aria-valuenow')).toBe('100')
    expect(md.className).toMatch(/h-3\.5/)
    expect(md.className).not.toMatch(/bg-track/)
    expect(md.style.backgroundColor).toMatch(/#eeeeee|rgb\(238, 238, 238\)/)
    expect((md.firstElementChild as HTMLElement).getAttribute('style')).toMatch(/--env-plum/)
  })

  it('ProgressRing draws its track in --track', () => {
    const { container } = render(<ProgressRing value={0.3} label="Trip" />)
    expect(container.querySelector('circle')?.getAttribute('stroke')).toBe('var(--track)')
  })

  it('maps data colours once: money in green, debt plum, never the accent', () => {
    expect(DATA_COLOR.in).toBe('var(--env-sage)')
    expect(DATA_COLOR.debt).toBe('var(--env-plum)')
    for (const c of Object.values(DATA_COLOR)) expect(c).not.toMatch(/accent/)
    expect(tint('var(--env-sage)', 12)).toBe(
      'color-mix(in oklab, var(--env-sage) 12%, var(--surface))',
    )
  })
})
