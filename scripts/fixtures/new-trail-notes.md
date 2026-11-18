---
title: "Offline sync spec"
verification: off
---

# Offline sync: design notes

Context for whoever charts the trail. Edits made offline must reach every device once it is back online.

## Sync protocol

1. Each device keeps an append-only log of edits.
2. On reconnect it sends what the server hasn't seen, oldest first.
3. The server answers with what the device hasn't seen.

## Conflicts

- Two edits to **different** fields merge silently.
- Two edits to the **same** field are both kept, and the person picks one.
  - The loser is never dropped: it stays in the history.

```ts
// a log entry
type Edit = { id: string; field: string; value: string; at: number };
```

> Open question: how long do we keep the log on a phone that is offline for weeks?

<!-- teamtrail:meta {"verification":"off"} -->

## Decisions so far

Nothing here is a decision: it is a heading inside the notes.
