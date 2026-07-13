export interface ExpiryHeapNode {
  key: string;
  expiresAt: number;
}

/**
 * Binary min-heap of cache-entry expiry times, ordered by `expiresAt`.
 *
 * Nodes are not removed when their entry is deleted or overwritten — callers
 * detect stale nodes by comparing the node against the live store and pop
 * them lazily.
 *
 * @internal
 */
export class ExpiryHeap {
  private _nodes: ExpiryHeapNode[] = [];

  get length(): number {
    return this._nodes.length;
  }

  peek(): ExpiryHeapNode | undefined {
    return this._nodes[0];
  }

  push(key: string, expiresAt: number): void {
    this._nodes.push({ key, expiresAt });
    this._bubbleUp(this._nodes.length - 1);
  }

  pop(): ExpiryHeapNode | undefined {
    if (this._nodes.length === 0) {
      return undefined;
    }

    const [top] = this._nodes;
    const last = this._nodes.pop() as ExpiryHeapNode;

    if (this._nodes.length > 0) {
      this._nodes[0] = last;
      this._bubbleDown(0);
    }

    return top;
  }

  clear(): void {
    this._nodes.length = 0;
  }

  /** Replaces the heap contents with the given nodes and heapifies in place. */
  rebuild(nodes: ExpiryHeapNode[]): void {
    this._nodes = nodes;

    for (let i = (nodes.length >> 1) - 1; i >= 0; i--) {
      this._bubbleDown(i);
    }
  }

  private _bubbleUp(index: number): void {
    const node = this._nodes[index];

    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      const parent = this._nodes[parentIndex];

      if (parent.expiresAt <= node.expiresAt) {
        break;
      }

      this._nodes[index] = parent;
      index = parentIndex;
    }

    this._nodes[index] = node;
  }

  private _bubbleDown(index: number): void {
    const nodes = this._nodes;
    const { length } = nodes;
    const { [index]: node } = nodes;

    for (;;) {
      const left = index * 2 + 1;

      if (left >= length) {
        break;
      }

      const right = left + 1;
      const smallest =
        right < length && nodes[right].expiresAt < nodes[left].expiresAt ? right : left;

      if (nodes[smallest].expiresAt >= node.expiresAt) {
        break;
      }

      nodes[index] = nodes[smallest];
      index = smallest;
    }

    nodes[index] = node;
  }
}
