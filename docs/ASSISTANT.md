# Assistant

## What it replaced

The prototype sent customer questions plus a browser-built prompt to Google Gemini, either from the API or **directly from the browser using a key embedded in the web bundle** (`VITE_GEMINI_API_KEY`). The "AI" credit scores and insights elsewhere in the app were rule-based code running over demo data in the browser. Gemini and its configuration have been removed.

## How it works now

No paid API and no model training. The assistant (`server/modules/assistant`) answers in this order:

1. **Refusals** for requests to approve/change loans, investment advice, or other people's information.
2. **The customer's own account** (applications, balances, next payment) — read from the database for the signed-in customer only.
3. **Repayment estimates** — calculated from the product's *configured* rate, fees and limits. If a product has no approved rate, it says so.
4. **Product questions** — answered from the loan product configuration (limits, terms, rates, fees, documents). Nothing is invented; unpublished figures are reported as unpublished.
5. **Membership questions** — from the membership policy setting and the customer's member record.
6. **Policy and guidance** — PostgreSQL full-text search over **approved** knowledge documents, quoting the matching passage and citing its source. Staff-only documents are never searched for customers.
7. **Fallback** — "I don't have approved information…", with contact details and a link to message a loan officer.

Every answer is labelled as automated guidance, not a loan decision or offer.

### Optional self-hosted model

If `ASSISTANT_OLLAMA_URL` and `ASSISTANT_OLLAMA_MODEL` are set (e.g. a small model on Ollama), the model may only **re-word** a grounded answer. Any re-worded answer containing a number not present in the grounded answer is discarded and the original is used. The customer's personal account answers are never sent to the model. This is off by default and has not been evaluated with a specific model.

## Knowledge base (ingestion pipeline)

Staff with `knowledge.manage` add documents (Markdown text with headings) in Staff portal → Assistant knowledge, with a source type and reference. Documents are:

1. split into heading-aware chunks (≤ ~900 characters),
2. indexed with a generated `tsvector` + GIN index,
3. searchable only once **approved by someone other than the author**,
4. returned to draft whenever edited (re-approval required).

Seeded content: three short summaries of Pinnacle's public website (responsible lending, SME document guidance, contact/licence). The institution should replace these with its approved policies, product sheets and FAQs.

### Data sources

Only the institution's own approved material and its public website are used. No data from other institutions was collected or used, and no model was trained or fine-tuned. External financial-education material may be added as knowledge documents only where its licence permits reuse.

## Logging and privacy

`assistant_logs` stores the intent, whether it was answered, source titles, latency, errors, and the question **with all digits masked**. It does not store answers or document content. Usage, unanswered questions and errors are visible in Staff portal → Assistant knowledge.

## Tests

`server/tests/services.test.ts` checks that the assistant refuses actions and advice, does not invent a rate for an unconfigured product, computes estimates only from configured terms, answers policy questions with citations, falls back on unrelated questions, hides drafts and staff-only knowledge, enforces author ≠ approver, and masks numbers in logs.
