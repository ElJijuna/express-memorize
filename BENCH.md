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

### Run 1

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

### Run 1

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

### Run 2

After optimizing the shared TTL scheduler to track the key that owns the next
expiry:

| Task | Throughput |
|------|------------|
| JSON serialize, simple object | `~1.72M ops/s` |
| v8 serialize, simple object | `~408k ops/s` |
| JSON deserialize, simple object | `~716k ops/s` |
| v8 deserialize, simple object | `~182k ops/s` |
| JSON serialize, large array 500 | `~5,957 ops/s` |
| v8 serialize, large array 500 | `~5,638 ops/s` |
| JSON deserialize, large array 500 | `~4,203 ops/s` |
| v8 deserialize, large array 500 | `~1,973 ops/s` |

## Cache Throughput

### Run 1

| Task | Throughput |
|------|------------|
| JSON `getValue()` hot entries | `~883k ops/s` |
| v8 `getValue()` hot entries | `~306k ops/s` |
| JSON `set()` | `~85k ops/s` |
| v8 `set()` | `~69k ops/s` |

### Run 2

After optimizing the shared TTL scheduler to track the key that owns the next
expiry:

| Task | Throughput |
|------|------------|
| JSON `getValue()` hot entries | `~887k ops/s` |
| v8 `getValue()` hot entries | `~291k ops/s` |
| JSON `set()` | `~1.04M ops/s` |
| v8 `set()` | `~264k ops/s` |

## Notes

An earlier run showed `cache.set()` dropping to roughly `~85k ops/s` with the
default finite TTL. That was traced to the shared TTL scheduler re-scanning when
overwritten entries had the same `expiresAt` as the scheduled expiry. The
scheduler now tracks the key that owns the next expiry, so overwriting unrelated
entries does not reprogram the timer. `cache.set()` returned to the expected
range in the latest run.

Recommended follow-up: keep separate benchmark cases for finite TTL and
`ttl: Infinity` when comparing pure serialization throughput against full cache
bookkeeping.

## Run 3: Batched Lazy Expiry Cleanup

After batching lazy expiry cleanup in `getAll()` / `getAllAsync()` so the TTL
scheduler reprograms once after removing multiple expired entries.

Command:

```bash
EVENTLOOP_ENTRIES=50000 npm run bench:eventloop
```

| Operation | Duration | Max event-loop block | Result |
|-----------|----------|----------------------|--------|
| `populate set()` | `1049.43 ms` | `1051.20 ms` | `50000` |
| `hot getValue()` | `707.05 ms` | `707.26 ms` | `50000` |
| `getAll()` | `48.97 ms` | `50.50 ms` | `50000` |
| `deleteMatching(key:1*)` | `10.90 ms` | `12.21 ms` | `11111` |
| `clear()` | `12.90 ms` | `14.28 ms` | `38889` |
| `populate async target` | `1052.48 ms` | `1052.77 ms` | `50000` |
| `getAllAsync(1000)` | `55.44 ms` | `11.27 ms` | `50000` |
| `deleteMatchingAsync(key:1*, 1000)` | `11.80 ms` | `1.66 ms` | `11111` |
| `clearAsync(1000)` | `16.76 ms` | `2.45 ms` | `38889` |

## Run 4: Lazy Worker Pool

After adding `asyncSerializerWorkers` with lazy worker creation and clamping.

Commands:

```bash
EVENTLOOP_ENTRIES=50000 npm run bench:eventloop
npm run bench
```

Event loop pressure with `50_000` entries:

| Operation | Duration | Max event-loop block | Result |
|-----------|----------|----------------------|--------|
| `populate set()` | `1066.32 ms` | `1068.50 ms` | `50000` |
| `hot getValue()` | `765.84 ms` | `767.56 ms` | `50000` |
| `getAll()` | `49.14 ms` | `50.66 ms` | `50000` |
| `deleteMatching(key:1*)` | `10.20 ms` | `11.50 ms` | `11111` |
| `clear()` | `12.48 ms` | `13.84 ms` | `38889` |
| `populate async target` | `965.24 ms` | `965.74 ms` | `50000` |
| `getAllAsync(1000)` | `45.26 ms` | `9.99 ms` | `50000` |
| `deleteMatchingAsync(key:1*, 1000)` | `10.05 ms` | `1.91 ms` | `11111` |
| `clearAsync(1000)` | `14.97 ms` | `1.94 ms` | `38889` |

Serializer throughput:

| Task | Throughput |
|------|------------|
| JSON serialize, simple object | `~1.84M ops/s` |
| v8 serialize, simple object | `~396k ops/s` |
| JSON deserialize, simple object | `~722k ops/s` |
| v8 deserialize, simple object | `~184k ops/s` |
| JSON serialize, large array 500 | `~5,967 ops/s` |
| v8 serialize, large array 500 | `~5,867 ops/s` |
| JSON deserialize, large array 500 | `~4,188 ops/s` |
| v8 deserialize, large array 500 | `~2,438 ops/s` |

Cache throughput:

| Task | Throughput |
|------|------------|
| JSON `set()` | `~939k ops/s` |
| v8 `set()` | `~282k ops/s` |
| JSON `getValue()` hot entries | `~868k ops/s` |
| v8 `getValue()` hot entries | `~314k ops/s` |
| JSON `remember()` hit | `~425k ops/s` |
| v8 `remember()` hit | `~199k ops/s` |

Event loop pressure from `npm run bench` with `25_000` entries:

| Operation | Duration | Max event-loop block | Result |
|-----------|----------|----------------------|--------|
| `populate set()` | `499.02 ms` | `501.48 ms` | `25000` |
| `hot getValue()` | `352.87 ms` | `354.42 ms` | `25000` |
| `getAll()` | `23.91 ms` | `25.53 ms` | `25000` |
| `deleteMatching(key:1*)` | `9.18 ms` | `10.42 ms` | `11111` |
| `clear()` | `6.36 ms` | `7.79 ms` | `13889` |
| `populate async target` | `451.62 ms` | `452.98 ms` | `25000` |
| `getAllAsync(1000)` | `18.95 ms` | `4.67 ms` | `25000` |
| `deleteMatchingAsync(key:1*, 1000)` | `10.12 ms` | `2.47 ms` | `11111` |
| `clearAsync(1000)` | `5.91 ms` | `2.19 ms` | `13889` |

## Run 5: Worker Threshold And Async Cache Bench

After adding `asyncSerializerThresholdBytes` and a dedicated async cache
benchmark for yield vs worker, small vs large payloads, and worker pool sizes.

Command:

```bash
npm run bench
```

Serializer throughput:

| Task | Throughput |
|------|------------|
| JSON serialize, simple object | `~1.65M ops/s` |
| v8 serialize, simple object | `~325k ops/s` |
| JSON deserialize, simple object | `~679k ops/s` |
| v8 deserialize, simple object | `~160k ops/s` |
| JSON serialize, large array 500 | `~6,303 ops/s` |
| v8 serialize, large array 500 | `~5,692 ops/s` |
| JSON deserialize, large array 500 | `~4,314 ops/s` |
| v8 deserialize, large array 500 | `~2,059 ops/s` |

Cache throughput:

| Task | Throughput |
|------|------------|
| JSON `set()` | `~959k ops/s` |
| v8 `set()` | `~312k ops/s` |
| JSON `getValue()` hot entries | `~849k ops/s` |
| v8 `getValue()` hot entries | `~330k ops/s` |
| JSON `remember()` hit | `~380k ops/s` |
| v8 `remember()` hit | `~213k ops/s` |

Async cache throughput:

| Task | Throughput |
|------|------------|
| yield `setAsync` small payload | `~157k ops/s` |
| worker `setAsync` small payload | `~17.5k ops/s` |
| yield `setAsync` large payload | `~615 ops/s` |
| worker(1) `setAsync` large payload | `~99 ops/s` |
| worker(auto) `setAsync` large payload | `~109 ops/s` |
| worker(4) `setAsync` large payload | `~110 ops/s` |
| yield `getValueAsync` large payload | `~434 ops/s` |
| worker(1) `getValueAsync` large payload | `~116 ops/s` |
| worker(auto) `getValueAsync` large payload | `~116 ops/s` |
| worker(4) `getValueAsync` large payload | `~104 ops/s` |

Event loop pressure from `npm run bench` with `25_000` entries:

| Operation | Duration | Max event-loop block | Result |
|-----------|----------|----------------------|--------|
| `populate set()` | `535.22 ms` | `536.87 ms` | `25000` |
| `hot getValue()` | `359.45 ms` | `360.71 ms` | `25000` |
| `getAll()` | `31.94 ms` | `33.19 ms` | `25000` |
| `deleteMatching(key:1*)` | `8.82 ms` | `10.08 ms` | `11111` |
| `clear()` | `5.90 ms` | `7.16 ms` | `13889` |
| `populate async target` | `481.80 ms` | `483.13 ms` | `25000` |
| `getAllAsync(1000)` | `25.53 ms` | `4.53 ms` | `25000` |
| `deleteMatchingAsync(key:1*, 1000)` | `7.70 ms` | `1.90 ms` | `11111` |
| `clearAsync(1000)` | `8.11 ms` | `2.24 ms` | `13889` |

Notes:

- Worker offload is significantly slower for small payloads in this sequential
  benchmark, which validates keeping a non-zero default threshold.
- Worker offload is also slower for the large JSON payload in this benchmark,
  likely because structured-clone transfer overhead dominates. Worker mode may
  still be useful when protecting event-loop responsiveness matters more than
  per-operation latency, or under parallel request pressure.
