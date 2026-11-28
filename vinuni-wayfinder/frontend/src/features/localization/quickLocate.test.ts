import { describe, expect, it } from 'vitest'
import type { BackendLocateResponse } from '../wayfinder/wayfinderApi'
import { afterLocate, startUrl } from './quickLocate'

const result = (over: Partial<BackendLocateResponse>): BackendLocateResponse => ({
  photoId: 'p_1', spot: 'i_hall', label: 'Hành lang trước phòng I109', confidence: 0.8, tier: 'auto', roomIds: [],
  topSim: 0.6, top3: [{ spot: 'i_hall', label: 'Hành lang trước phòng I109', votes: 8 }], combined: false, ms: 140, ...over,
})

describe('startUrl', () => {
  it('starts the journey right away when the destination is known', () => {
    const url = new URL(startUrl('i_hall', 'Hành lang I109', 'G101', 'camera'), 'http://x')
    expect(url.pathname).toBe('/hanh-trinh')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ from: 'i_hall', fromLabel: 'Hành lang I109', to: 'G101', mode: 'camera', tuAnh: '1' })
  })
  it('goes back to route planning when no destination was chosen yet', () => {
    const url = new URL(startUrl('i_hall', 'Hành lang I109', '', 'card'), 'http://x')
    expect(url.pathname).toBe('/di-den')
    expect(url.searchParams.get('from')).toBe('i_hall')
    expect(url.searchParams.has('to')).toBe(false)
  })
})

describe('afterLocate', () => {
  it('goes straight on when the match is confident', () => {
    expect(afterLocate(result({ tier: 'auto' }))).toEqual({ kind: 'go', spot: 'i_hall', label: 'Hành lang trước phòng I109' })
  })
  it('asks the walker to pick among the top 3 when unsure', () => {
    expect(afterLocate(result({ tier: 'picker' })).kind).toBe('pick')
  })
  it('asks for one more photo from another angle the first time', () => {
    expect(afterLocate(result({ tier: 'second' }))).toEqual({ kind: 'again', previous: 'p_1' })
  })
  it('never asks for a third photo: a weak combined result falls back to the picker', () => {
    expect(afterLocate(result({ tier: 'second', combined: true })).kind).toBe('pick')
  })
})
