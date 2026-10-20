# Product principles

The product thesis, design principles, current priorities and non-goals. Use these to evaluate new product work. This page records direction; delivery status is in the [roadmap](roadmap.md).

## Product thesis

Splitiful helps a group record who paid for shared expenses and see a clear,
trusted balance at the end. The two core moments are quick expense entry and
seeing an understandable settle-up result. Use these principles when evaluating new
product work; this section records direction, while the [roadmap](roadmap.md) remains
the source for delivery status.

## Design principles

- Keep expense entry quick. The default equal split should remain easy to use
  without requiring groups to configure how they divide every purchase.
- Make the final balance easy to understand without asking users to reconcile
  a ledger or interpret charts.
- Avoid features that require the whole group to negotiate new settings or
  decisions unless they clearly improve the core experience.
- Prefer correctness and clear data handling over automation that can silently
  produce a wrong amount.
- Keep optional features optional. The shared shopping list is shipped as a
  convenience before logging an expense; skipping it must not change the core
  expense flow. It is a pre-purchase checklist with description-only prefill,
  not post-hoc itemization of a bill.

## Current priorities and non-goals

- Expense deletion with Undo is implemented and awaiting release (see the
  [roadmap](roadmap.md)). A future in-app "mark paid / settled" state must
  re-review every delete, Undo and erase path first (recorded constraint M1,
  ADR 0017).
- After current release work is complete, prioritize friction observed in
  real use of expense entry and settle-up rather than pre-planning a large new
  feature set.
- Receipt capture and OCR, post-hoc per-bill itemization, payment-rail
  integrations, multi-currency accounting, spending charts, AI categorization,
  and social feeds are not current product plans. Reconsider them only through
  an explicit product decision that addresses added complexity and correctness
  risks. A simple external payment link could be considered separately if a
  concrete need emerges.

## Related

- [Roadmap](roadmap.md)
- [Market research](../research/market-research-2026-09.md)

Last reviewed: 2026-10-19
