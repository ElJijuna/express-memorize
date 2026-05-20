# Benchmarks

Benchmark runs from the current optimization pass.

## Commands

```bash
EVENTLOOP_ENTRIES=50000 npm run bench:eventloop
npm run bench
```

`bench:eventloop` compares synchronous cache operations against async batched
variants and reports the maximum event-loop delay observed during each task.

## Event Loop Pressure

Run with `50_000` entries and `25` payload items per entry:

| Operation | Duration | Max event-loop block | Result |
|-----------|----------|----------------------|--------|
| `getAll()` | `47.79 ms` | `49.35 ms` | `50000` |
| `getAllAsync(1000)` | `50.46 ms` | `9.32 ms` | `50000` |
| `deleteMatching(key:1*)` | `11.80 ms` | `13.13 ms` | `11111` |
| `deleteMatchingAsync(key:1*, 1000)` | `11.23 ms` | `2.04 ms` | `11111` |
| `clear()` | `15.85 ms` | `17.10 ms` | `38889` |
| `clearAsync(1000)` | `18.00 ms` | `2.65 ms` | `38889` |

The async batched variants keep total runtime in the same range while reducing
the longest event-loop pause substantially.

## Serializer Throughput

From `npm run bench`:

| Task | Throughput |
|------|------------|
| JSON serialize, simple object | `~1.79M ops/s` |
| v8 serialize, simple object | `~411k ops/s` |
| JSON deserialize, simple object | `~673k ops/s` |
| v8 deserialize, simple object | `~180k ops/s` |
| JSON serialize, large array 500 | `~5,997 ops/s` |
| v8 serialize, large array 500 | `~5,395 ops/s` |
| JSON deserialize, large array 500 | `~4,360 ops/s` |
| v8 deserialize, large array 500 | `~2,431 ops/s` |

## Cache Throughput

From `npm run bench`:

| Task | Throughput |
|------|------------|
| JSON `getValue()` hot entries | `~883k ops/s` |
| v8 `getValue()` hot entries | `~306k ops/s` |
| JSON `set()` | `~85k ops/s` |
| v8 `set()` | `~69k ops/s` |

## Notes

`cache.set()` is slower in the full benchmark than earlier runs. The likely
cause is that this benchmark uses the default finite TTL, so the shared TTL
scheduler participates in many insertions. When measuring serialization-only
set throughput, use `ttl: Infinity` to remove TTL scheduling from the benchmark.

Recommended follow-up: keep the scheduler optimized so it only reprograms when
the new `expiresAt` is earlier than the currently scheduled expiry, and keep
separate benchmark cases for finite TTL and `ttl: Infinity`.
