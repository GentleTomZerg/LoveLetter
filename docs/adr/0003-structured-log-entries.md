# 0003 — Log entries are structured (kind + params), formatted at render

`LogEntry {id, kind, text}` was built client-side in `reduceView` with English template strings baked into the core. Localization (ADR-0004) and the collapsed "latest event" line both need the underlying *facts*, not pre-formatted text.

Decision: log entries carry no display text — `{id, kind, params}` (e.g. `{kind: 'play', params: {player, card}}`). The client's locale dictionary formats them at render. The kinds already existed; the event stream already carries every parameter.

Consequences: the full log and the "latest event" strip share one formatting path; wire events are unchanged; tests that asserted on log text change to assert on kinds/params.

Note: enriching resolution lines with cause/effect ("Bob is out — Alice's Baron beat his Guard") was considered in the same session and explicitly declined — entries stay one-per-event, params exactly as carried by the events.

Status: accepted. Source: grilling session Q5 (2025).
