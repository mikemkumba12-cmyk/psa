import { Router, type Request } from 'express';
import { z } from 'zod';
import { config } from '../../config';
import { many, one, query } from '../../db/pool';
import { parse, route } from '../../lib/http';
import { quoteLoan } from '../../lib/loanMath';
import { requirePermission } from '../../auth/permissions';
import { getSetting, type MembershipPolicy } from '../settings/settings';
import { isAvailable, listProducts, type ProductRow } from '../products/products.service';
import { loanPosition } from '../applications/applications.service';
import { ensureKnowledgeIndexed, searchKnowledge } from './knowledge';

/**
 * Pinnacle assistant — governed, retrieval-based, no paid AI service.
 *
 * Rules (enforced in code, not by prompt):
 *  1. Product facts (limits, terms, rates, fees, documents) come only from the loan product configuration.
 *     If a figure is not configured, the assistant says so instead of estimating.
 *  2. Personal information is only the signed-in customer's own records.
 *  3. Policy answers quote approved knowledge-base passages and cite them.
 *  4. The assistant cannot approve, change or submit anything, and it never gives investment advice.
 *  5. When nothing reliable matches, it says so and points to a human.
 * An optional self-hosted model (Ollama) may only re-word a grounded answer; any reply that
 * introduces a number not present in the grounded answer is discarded.
 */

export interface AssistantReply {
  answer: string;
  intent: string;
  sources: Array<{ title: string; reference: string | null }>;
  grounded: boolean;
  suggestions?: string[];
  handoff?: boolean;
}

const money = (value: number) => `MWK ${Math.round(value).toLocaleString('en-US')}`;

function maskNumbers(text: string): string {
  return text.replace(/\d/g, '#').slice(0, 500);
}

function productFacts(product: ProductRow): string {
  const parts: string[] = [`**${product.name}** — ${product.description}`];
  if (product.min_amount !== null && product.max_amount !== null) parts.push(`Amount: ${money(product.min_amount)} to ${money(product.max_amount)}.`);
  if (product.min_term_months !== null && product.max_term_months !== null) {
    parts.push(product.repayment_frequency === 'bullet'
      ? `Repaid in one payment after ${product.min_term_months}–${product.max_term_months} months.`
      : `Term: ${product.min_term_months} to ${product.max_term_months} months, repaid monthly.`);
  }
  parts.push(product.interest_rate_monthly !== null
    ? `Interest: ${product.interest_rate_monthly}% per month (${product.interest_method === 'flat' ? 'flat rate' : 'reducing balance'}).`
    : 'Interest rate: not yet published in the system — please ask a loan officer.');
  if (product.fees.length) parts.push(`Fees: ${product.fees.map(fee => `${fee.name} ${fee.type === 'percent' ? `${fee.value}%` : money(fee.value)}`).join(', ')}.`);
  if (product.members_only) parts.push('Available to eligible members only.');
  return parts.join(' ');
}

const REFUSALS: Array<{ pattern: RegExp; answer: string; intent: string }> = [
  { pattern: /\b(approve|disburse|increase my limit|change my (loan|balance|status)|waive|cancel my (loan|penalt))/i, intent: 'refused_action',
    answer: 'I can’t approve, change or cancel loans or records. Decisions are made by authorised staff. I can explain the process or help you message a loan officer.' },
  { pattern: /\b(invest|stocks?|shares|crypto|bitcoin|forex|which bank is best)\b/i, intent: 'refused_advice',
    answer: 'I can’t give investment or personal financial advice. I can help with Pinnacle’s loan products, your applications and repayments.' },
  { pattern: /\b(other (customer|client|person)s?|someone else'?s|another (customer|client))\b/i, intent: 'refused_privacy',
    answer: 'I can only discuss your own information.' },
];

async function contactLine(): Promise<string> {
  const branding = await getSetting<Record<string, any>>('branding');
  const bits = [branding.tollFree && `toll free ${branding.tollFree}`, branding.supportPhone, branding.supportEmail].filter(Boolean);
  return bits.length ? `You can reach Pinnacle on ${bits.join(', ')}.` : 'Please contact your branch.';
}

function extractAmountAndTerm(text: string): { amount: number | null; term: number | null } {
  const normalised = text.toLowerCase().replace(/,/g, '');
  let amount: number | null = null;
  const amountMatch = /(?:mwk|mk|k)?\s*(\d+(?:\.\d+)?)\s*(million|m\b|thousand|k\b)?/.exec(normalised.replace(/(\d+)\s*(months?|mo)\b/g, ''));
  if (amountMatch) {
    const base = Number(amountMatch[1]);
    const unit = amountMatch[2];
    amount = unit?.startsWith('m') ? base * 1_000_000 : unit === 'thousand' || unit === 'k' ? base * 1000 : base;
  }
  const termMatch = /(\d+)\s*(months?|mo)\b/.exec(normalised);
  return { amount: amount && amount >= 1000 ? amount : null, term: termMatch ? Number(termMatch[1]) : null };
}

function matchProduct(text: string, products: ProductRow[]): ProductRow | null {
  const lower = text.toLowerCase();
  const synonyms: Record<string, string[]> = {
    payroll: ['payroll', 'salary', 'salaried'],
    working_capital: ['working capital', 'stock', 'inventory'],
    enterprise: ['enterprise'],
    asset_financing: ['asset', 'equipment', 'vehicle', 'machinery'],
    invoice_discounting: ['invoice'],
    order_financing: ['order financ', 'purchase order', 'order'],
    personal: ['personal'],
  };
  return products.find(product => lower.includes(product.name.toLowerCase()))
    ?? products.find(product => (synonyms[product.category] || []).some(word => lower.includes(word)))
    ?? null;
}

export async function answer(req: Request, message: string): Promise<AssistantReply> {
  const auth = req.auth!;
  const text = message.trim();
  const lower = text.toLowerCase();

  for (const refusal of REFUSALS) {
    if (refusal.pattern.test(text)) return { answer: refusal.answer, intent: refusal.intent, sources: [], grounded: true };
  }

  const allProducts = await listProducts();
  const products = auth.isStaff ? allProducts.filter(product => product.status !== 'retired') : allProducts.filter(product => isAvailable(product));
  const productSource = { title: 'Loan product configuration', reference: null };

  // ── The customer's own applications and loans ─────────────────────────────
  if (auth.role === 'customer' && /\b(my (loan|application|balance|repayment|payment)s?|next (payment|repayment|installment)|how much do i owe|status of my)\b/.test(lower)) {
    const apps = await many(
      `SELECT a.id, a.reference, a.status, a.amount, p.name AS product_name FROM loan_applications a JOIN loan_products p ON p.id = a.product_id
        WHERE a.customer_id = $1 AND a.status <> 'withdrawn' ORDER BY a.updated_at DESC LIMIT 5`,
      [auth.customerId],
    );
    if (!apps.length) {
      return { answer: 'You have no loan applications yet. You can start one from **Apply for a loan**.', intent: 'own_account', sources: [{ title: 'Your account', reference: null }], grounded: true };
    }
    const lines: string[] = [];
    for (const app of apps) {
      let line = `• ${app.reference} (${app.product_name}, ${money(app.amount)}): ${String(app.status).replace(/_/g, ' ')}`;
      if (app.status === 'disbursed') {
        const position = await loanPosition(app.id);
        if (position) {
          line += ` — outstanding ${money(position.outstandingTotal)}`;
          if (position.arrearsAmount > 0) line += `, overdue ${money(position.arrearsAmount)}`;
          if (position.nextDue) line += `, next payment ${money(position.nextDue.amount)} due ${position.nextDue.date}`;
        }
      }
      lines.push(line);
    }
    return { answer: `Here is where your applications stand:\n${lines.join('\n')}`, intent: 'own_account', sources: [{ title: 'Your account', reference: null }], grounded: true };
  }

  // ── Repayment estimate ────────────────────────────────────────────────────
  if (/\b(how much (would|will) i (pay|repay)|monthly (payment|installment)|calculate|estimate|repayment for)\b/.test(lower)) {
    const product = matchProduct(lower, products);
    const { amount, term } = extractAmountAndTerm(lower);
    if (!product) {
      return { answer: `Which product is this for? Available: ${products.map(item => item.name).join(', ') || 'none at the moment'}.`, intent: 'estimate_clarify', sources: [productSource], grounded: true, suggestions: products.slice(0, 3).map(item => `Estimate ${item.name} for 1 million over 6 months`) };
    }
    if (product.interest_rate_monthly === null) {
      return { answer: `I can’t estimate repayments for ${product.name} because its interest rate is not yet published in the system. ${await contactLine()}`, intent: 'estimate_unavailable', sources: [productSource], grounded: true, handoff: true };
    }
    if (!amount || !term) {
      return { answer: `Tell me the amount and the number of months, for example “${product.name} for 2 million over ${product.max_term_months ?? 6} months”.`, intent: 'estimate_clarify', sources: [productSource], grounded: true };
    }
    const outOfRange = (product.min_amount !== null && amount < product.min_amount) || (product.max_amount !== null && amount > product.max_amount)
      || (product.min_term_months !== null && term < product.min_term_months) || (product.max_term_months !== null && term > product.max_term_months);
    if (outOfRange) return { answer: `That is outside ${product.name}’s limits. ${productFacts(product)}`, intent: 'estimate_out_of_range', sources: [productSource], grounded: true };
    const quote = quoteLoan({ principal: amount, termMonths: term, monthlyRatePct: product.interest_rate_monthly, interestMethod: product.interest_method, repaymentFrequency: product.repayment_frequency, fees: product.fees, startDate: new Date().toISOString().slice(0, 10) });
    const repayment = product.repayment_frequency === 'bullet' ? `one repayment of ${money(quote.totalRepayable)} after ${term} months` : `${term} monthly payments of about ${money(quote.installmentAmount)}`;
    return {
      answer: `Estimate for ${product.name}, ${money(amount)} over ${term} months: ${repayment}. Total repayable ${money(quote.totalRepayable)}${quote.totalFees ? `, plus fees of ${money(quote.totalFees)}` : ''}. This is an estimate from the configured product terms, not an offer; your actual offer depends on assessment.`,
      intent: 'estimate', sources: [productSource], grounded: true,
    };
  }

  // ── Product questions ─────────────────────────────────────────────────────
  const product = matchProduct(lower, products);
  const asksAboutProducts = /\b(loans?|products?|financ\w*|borrow|interest|rates?|fees?|charges|limits?|maximum|minimum|how long|term|tenure)\b/.test(lower);
  if (asksAboutProducts && (product || /\b(what|which|list|available|offer)\b/.test(lower))) {
    if (product) {
      const docs = product.required_documents.length
        ? (await many('SELECT label FROM document_types WHERE code = ANY($1::text[]) ORDER BY sort_order', [product.required_documents])).map(row => row.label)
        : [];
      return {
        answer: `${productFacts(product)}${docs.length ? ` Documents needed: ${docs.join(', ')}.` : ''}`,
        intent: 'product_info', sources: [productSource], grounded: true,
      };
    }
    if (!products.length) return { answer: `No loan products are open for applications in the system right now. ${await contactLine()}`, intent: 'product_list', sources: [productSource], grounded: true, handoff: true };
    return {
      answer: `Products currently available:\n${products.map(item => `• ${productFacts(item)}`).join('\n')}`,
      intent: 'product_list', sources: [productSource], grounded: true,
    };
  }

  // ── Membership ────────────────────────────────────────────────────────────
  if (/\b(member|membership)\b/.test(lower)) {
    const policy = await getSetting<MembershipPolicy>('membership_policy');
    let own = '';
    if (auth.role === 'customer') {
      const member = await one('SELECT member_number, status FROM members WHERE customer_id = $1', [auth.customerId]);
      own = member ? ` Your membership ${member.member_number} is currently **${member.status}**.` : ' You do not have a membership record yet; you can submit your member number from your profile for staff to verify.';
    }
    return {
      answer: `SME financing is for eligible members. A membership counts once staff have verified it against the membership register${policy.minimumMembershipMonths ? ` and it is at least ${policy.minimumMembershipMonths} month(s) old` : ''}. For a business, at least one verified owner or director must be an eligible member.${own}`,
      intent: 'membership', sources: [{ title: 'Membership policy (system setting)', reference: null }], grounded: true,
    };
  }

  // ── Approved knowledge base ───────────────────────────────────────────────
  await ensureKnowledgeIndexed();
  const hits = await searchKnowledge(text, auth.isStaff ? 'staff' : 'public');
  if (hits.length) {
    const top = hits.slice(0, 2);
    return {
      answer: top.map(hit => (hit.heading ? `**${hit.heading}** — ${hit.content}` : hit.content)).join('\n\n'),
      intent: 'knowledge', grounded: true,
      sources: [...new Map(top.map(hit => [hit.documentId, { title: hit.title, reference: hit.sourceReference }])).values()],
    };
  }

  return {
    answer: `I don’t have approved information to answer that reliably, so I won’t guess. ${await contactLine()} You can also send a message to a loan officer from the Messages page.`,
    intent: 'fallback', sources: [], grounded: false, handoff: true,
    suggestions: ['What loans are available?', 'What documents do I need for SME finance?', 'What is the status of my application?'],
  };
}

/** Optional: let a self-hosted model re-word a grounded answer. Never allowed to add numbers. */
async function rephrase(reply: AssistantReply): Promise<{ text: string; used: boolean; rejected: boolean }> {
  if (!config.assistant.ollamaUrl || !config.assistant.ollamaModel || !reply.grounded || reply.intent === 'own_account') {
    return { text: reply.answer, used: false, rejected: false };
  }
  try {
    const response = await fetch(`${config.assistant.ollamaUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        model: config.assistant.ollamaModel,
        stream: false,
        options: { temperature: 0 },
        prompt: `Rewrite the following answer in clear, friendly English for a customer of a Malawian lender. Do not add any facts, numbers, products or advice. Keep every number exactly as written.\n\nANSWER:\n${reply.answer}`,
      }),
    });
    if (!response.ok) return { text: reply.answer, used: false, rejected: true };
    const data = await response.json() as { response?: string };
    const candidate = (data.response || '').trim();
    const numbers = (value: string) => new Set(value.match(/\d[\d,.]*/g)?.map(item => item.replace(/[,.]$/, '')) ?? []);
    const allowed = numbers(reply.answer);
    const introduced = [...numbers(candidate)].filter(item => !allowed.has(item));
    if (!candidate || introduced.length) return { text: reply.answer, used: false, rejected: true };
    return { text: candidate, used: true, rejected: false };
  } catch {
    return { text: reply.answer, used: false, rejected: true };
  }
}

export const assistantRouter = Router();

assistantRouter.post('/assistant/chat', route(async (req, res) => {
  const { message } = parse(z.object({ message: z.string().trim().min(1, 'Type a question.').max(1000) }), req.body);
  const started = Date.now();
  let reply: AssistantReply;
  let error: string | null = null;
  try {
    reply = await answer(req, message);
  } catch (caught: any) {
    error = caught?.message || 'unknown error';
    reply = { answer: 'Sorry, I could not answer just now. Please try again or message a loan officer.', intent: 'error', sources: [], grounded: false, handoff: true };
  }
  const wording = await rephrase(reply);
  await query(
    `INSERT INTO assistant_logs (user_id, user_role, intent, question_masked, answered, source_ids, used_model, model_rejected, latency_ms, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [req.auth!.userId, req.auth!.role, reply.intent, maskNumbers(message), reply.grounded && reply.intent !== 'fallback',
      reply.sources.map(source => source.title), wording.used, wording.rejected, Date.now() - started, error],
  );
  res.json({ ...reply, answer: wording.text, modelAssisted: wording.used, disclaimer: 'Automated guidance from approved information. It is not a loan decision or an offer.' });
}));

/** Monitoring: what the assistant is being asked and how often it cannot answer. */
assistantRouter.get('/assistant/stats', requirePermission('knowledge.manage'), route(async (_req, res) => {
  const byIntent = await many(
    `SELECT intent, count(*)::int AS count, round(avg(latency_ms))::int AS avg_latency_ms
       FROM assistant_logs WHERE created_at > now() - interval '30 days' GROUP BY intent ORDER BY count DESC`,
  );
  const totals = await one(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT answered)::int AS unanswered, count(*) FILTER (WHERE error IS NOT NULL)::int AS errors
       FROM assistant_logs WHERE created_at > now() - interval '30 days'`,
  );
  const unanswered = await many(
    `SELECT question_masked, created_at FROM assistant_logs WHERE NOT answered AND created_at > now() - interval '30 days' ORDER BY created_at DESC LIMIT 25`,
  );
  res.json({ periodDays: 30, totals, byIntent, recentUnanswered: unanswered, modelConfigured: Boolean(config.assistant.ollamaUrl && config.assistant.ollamaModel) });
}));
