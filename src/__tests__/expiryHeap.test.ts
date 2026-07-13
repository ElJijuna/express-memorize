import { ExpiryHeap } from '../utils/expiryHeap';

describe('ExpiryHeap', () => {
  it('pops nodes in ascending expiresAt order', () => {
    const heap = new ExpiryHeap();
    const values = [50, 10, 90, 30, 70, 20, 80, 40, 60, 100];

    for (const value of values) {
      heap.push(`k${value}`, value);
    }

    const popped: number[] = [];

    while (heap.length > 0) {
      popped.push(heap.pop()?.expiresAt as number);
    }

    expect(popped).toEqual([...values].sort((a, b) => a - b));
  });

  it('peek returns the minimum without removing it', () => {
    const heap = new ExpiryHeap();

    heap.push('/b', 20);
    heap.push('/a', 10);

    expect(heap.peek()).toEqual({ key: '/a', expiresAt: 10 });
    expect(heap.length).toBe(2);
  });

  it('pop and peek on an empty heap return undefined', () => {
    const heap = new ExpiryHeap();

    expect(heap.peek()).toBeUndefined();
    expect(heap.pop()).toBeUndefined();
  });

  it('handles duplicate expiry values', () => {
    const heap = new ExpiryHeap();

    heap.push('/a', 10);
    heap.push('/b', 10);
    heap.push('/c', 5);

    expect(heap.pop()?.key).toBe('/c');
    expect([heap.pop()?.key, heap.pop()?.key].sort()).toEqual(['/a', '/b']);
  });

  it('clear empties the heap', () => {
    const heap = new ExpiryHeap();

    heap.push('/a', 10);
    heap.clear();

    expect(heap.length).toBe(0);
    expect(heap.pop()).toBeUndefined();
  });

  it('rebuild heapifies the given nodes in place', () => {
    const heap = new ExpiryHeap();

    heap.push('/stale', 1);
    heap.rebuild([
      { key: '/c', expiresAt: 30 },
      { key: '/a', expiresAt: 10 },
      { key: '/b', expiresAt: 20 },
    ]);

    expect(heap.length).toBe(3);
    expect(heap.pop()?.key).toBe('/a');
    expect(heap.pop()?.key).toBe('/b');
    expect(heap.pop()?.key).toBe('/c');
  });
});
