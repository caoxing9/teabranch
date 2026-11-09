import { describe, expect, test } from 'nsh/test'
import { KeyedMutex } from './mutex'

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5))

describe('KeyedMutex', () => {
  test('serialises work on one key and lets other keys through', async () => {
    const locks = new KeyedMutex()
    const order: string[] = []
    const a = locks.run('x', async () => {
      order.push('a:in')
      await tick()
      order.push('a:out')
    })
    const b = locks.run('x', async () => {
      order.push('b:in')
    })
    const c = locks.run('y', async () => {
      order.push('c:in')
    })
    await Promise.all([a, b, c])
    expect(order.indexOf('b:in')).toBeGreaterThan(order.indexOf('a:out'))
    expect(order.indexOf('c:in')).toBeLessThan(order.indexOf('a:out'))
  })

  test('a chain that holds the key walks straight through a nested run — a stop inside a delete', async () => {
    const locks = new KeyedMutex()
    let nested = false
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 300))
    const outcome = await Promise.race([
      locks.run('x', async (held) => {
        await locks.run(
          'x',
          async () => {
            nested = true
          },
          held,
        )
        return 'done' as const
      }),
      timeout,
    ])
    expect(outcome).toBe('done')
    expect(nested).toBe(true)
  })

  test('without the held token a nested run waits on itself', async () => {
    const locks = new KeyedMutex()
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 200))
    const outcome = await Promise.race([locks.run('x', () => locks.run('x', async () => 'inner')), timeout])
    expect(outcome).toBe('timeout')
  })
})
