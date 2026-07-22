import { describe, it, expect } from 'vitest'
import * as hooks from '../src/hooks'

describe('Direct import debug', () => {
  it('should show all exports', () => {
    console.log('hooks module:', hooks)
    console.log('keys:', Object.keys(hooks))
    expect(Object.keys(hooks).length).toBeGreaterThan(0)
  })
})