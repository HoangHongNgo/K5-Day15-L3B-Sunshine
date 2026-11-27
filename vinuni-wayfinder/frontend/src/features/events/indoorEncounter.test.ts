import { expect, it } from 'vitest'
import { matchesIndoorVenue } from './indoorEncounter'

it('requires automatic visual recognition at the event room', () => {
  expect(matchesIndoorVenue('lab', {tier:'auto', roomIds:['hall','lab']})).toBe(true)
  expect(matchesIndoorVenue('lab', {tier:'auto', roomIds:['upstairs']})).toBe(false)
  expect(matchesIndoorVenue('lab', {tier:'picker', roomIds:['lab']})).toBe(false)
  expect(matchesIndoorVenue('lab', {tier:'second', roomIds:['lab']})).toBe(false)
  expect(matchesIndoorVenue('lab', {tier:'auto'})).toBe(false)
})
