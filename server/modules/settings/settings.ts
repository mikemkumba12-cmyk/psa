import { Router } from 'express';
import { z } from 'zod';
import { many, one, transaction, type Queryable, pool } from '../../db/pool';
import { audit } from '../../lib/audit';
import { conflict, notFound, parse, route } from '../../lib/http';
import { newId } from '../../lib/ids';
import { requirePermission } from '../../auth/permissions';

export interface MembershipPolicy {
  minimumMembershipMonths: number;
  requireVerifiedMember: boolean;
  smeRequiresMemberOwnerOrDirector: boolean;
  representativeRequiresVerifiedAuthorization: boolean;
  confirmedByInstitution: boolean;
}

export interface AssessmentThresholds {
  maxIndividualDebtServiceRatio: number;
  minBusinessDebtServiceCoverage: number;
  maxInstallmentToRevenueRatio: number;
  minMonthsTrading: number;
  maxSingleCustomerConcentration: number;
  confirmedByInstitution: boolean;
}

export interface WorkflowSettings {
  requireSeparationOfDuties: boolean;
  offerValidityDays: number;
}

export const settingSchemas = {
  branding: z.object({
    institutionName: z.string().trim().min(2).max(200),
    shortName: z.string().trim().min(2).max(60),
    legalName: z.string().trim().max(200).nullable().optional(),
    website: z.string().trim().max(200).nullable().optional(),
    supportEmail: z.string().trim().max(200).nullable().optional(),
    supportPhone: z.string().trim().max(50).nullable().optional(),
    tollFree: z.string().trim().max(20).nullable().optional(),
    whatsapp: z.string().trim().max(50).nullable().optional(),
    regulatoryStatement: z.string().trim().max(300).nullable().optional(),
    logoUrl: z.string().trim().max(500).nullable().optional(),
    offices: z.array(z.object({ city: z.string().max(100), address: z.string().max(300) })).max(20).optional(),
    detailsSource: z.string().max(200).optional(),
    address: z.string().max(300).nullable().optional(),
  }),
  membership_policy: z.object({
    minimumMembershipMonths: z.number().int().min(0).max(240),
    requireVerifiedMember: z.boolean(),
    smeRequiresMemberOwnerOrDirector: z.boolean(),
    representativeRequiresVerifiedAuthorization: z.boolean(),
    confirmedByInstitution: z.boolean(),
  }),
  assessment_thresholds: z.object({
    maxIndividualDebtServiceRatio: z.number().min(0).max(1),
    minBusinessDebtServiceCoverage: z.number().min(0).max(10),
    maxInstallmentToRevenueRatio: z.number().min(0).max(1),
    minMonthsTrading: z.number().int().min(0).max(240),
    maxSingleCustomerConcentration: z.number().min(0).max(1),
    confirmedByInstitution: z.boolean(),
  }),
  workflow: z.object({
    requireSeparationOfDuties: z.boolean(),
    offerValidityDays: z.number().int().min(1).max(90),
  }),
} as const;

type SettingKey = keyof typeof settingSchemas;

export async function getSetting<T>(key: SettingKey, client: Queryable = pool): Promise<T> {
  const row = await one<{ value: T }>('SELECT value FROM app_settings WHERE key = $1', [key], client);
  if (!row) throw new Error(`Setting ${key} is missing; run migrations.`);
  return row.value;
}

export const publicSettingsRouter = Router();
export const settingsRouter = Router();

/** Branding shown on the sign-in and marketing pages. Contains only public contact information. */
publicSettingsRouter.get('/branding', route(async (_req, res) => {
  res.json(await getSetting('branding'));
}));

settingsRouter.get('/settings', requirePermission('settings.manage'), route(async (_req, res) => {
  const rows = await many('SELECT key, value, description, updated_at, updated_by FROM app_settings ORDER BY key');
  res.json(rows.map(row => ({ key: row.key, value: row.value, description: row.description, updatedAt: row.updated_at, updatedBy: row.updated_by })));
}));

/** Policies the assessment and eligibility screens need to explain themselves. */
settingsRouter.get('/settings/policies', route(async (req, res) => {
  if (!req.auth!.isStaff) {
    res.json({ membership: await getSetting('membership_policy') });
    return;
  }
  res.json({
    membership: await getSetting('membership_policy'),
    assessment: await getSetting('assessment_thresholds'),
    workflow: await getSetting('workflow'),
  });
}));

settingsRouter.put('/settings/:key', requirePermission('settings.manage'), route(async (req, res) => {
  const key = req.params.key as SettingKey;
  const schema = settingSchemas[key];
  if (!schema) throw notFound('Unknown setting.');
  const value = parse(schema as z.ZodType<Record<string, unknown>>, req.body);
  const before = await getSetting<Record<string, unknown>>(key);
  if (JSON.stringify(before) === JSON.stringify(value)) return res.json({ key, value, unchanged: true });
  const pending = await one<{ id: string }>(
    `SELECT id FROM governance_change_requests WHERE change_type = 'setting' AND entity_id = $1 AND status = 'pending'`, [key],
  );
  if (pending) throw conflict('There is already a pending governance request for this setting.');
  const requestId = newId('gov');
  await transaction(async client => {
    await client.query(
      `INSERT INTO governance_change_requests (id, change_type, entity_id, requested_by, payload, previous_value)
       VALUES ($1, 'setting', $2, $3, $4, $5)`,
      [requestId, key, req.auth!.userId, { key, value }, before],
    );
    await client.query(`INSERT INTO governance_change_events (request_id, actor_id, event_type) VALUES ($1, $2, 'submitted')`, [requestId, req.auth!.userId]);
    await audit(req, { action: 'governance.change_submitted', entityType: 'setting', entityId: key, summary: `Submitted a proposed update to ${key}; it is pending independent approval.`, metadata: { requestId, before, after: value } }, client);
  });
  res.status(202).json({ key, value, status: 'pending_approval', requestId });
}));
