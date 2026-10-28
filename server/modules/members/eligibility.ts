import { many, one, type Queryable, pool } from '../../db/pool';
import { getSetting, type MembershipPolicy } from '../settings/settings';

/**
 * Membership eligibility, evaluated only from records staff have created or verified.
 * The rules come from the `membership_policy` setting; its defaults are placeholders
 * until the institution confirms them (`confirmedByInstitution`).
 */

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  policyConfirmed: boolean;
}

interface MemberRow {
  member_number: string;
  status: string;
  joined_on: string | null;
  verified_at: Date | null;
}

function monthsBetween(fromIso: string, to = new Date()): number {
  const from = new Date(`${fromIso}T00:00:00Z`);
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return months;
}

export function evaluateMember(member: MemberRow | null, policy: MembershipPolicy): string[] {
  if (!member) return ['Not registered as a member.'];
  const reasons: string[] = [];
  if (member.status !== 'active') reasons.push(`Membership ${member.member_number} is ${member.status}, not active.`);
  if (policy.requireVerifiedMember && !member.verified_at) reasons.push(`Membership ${member.member_number} has not been verified by staff.`);
  if (policy.minimumMembershipMonths > 0) {
    if (!member.joined_on) reasons.push('Membership start date is not recorded.');
    else if (monthsBetween(member.joined_on) < policy.minimumMembershipMonths) {
      reasons.push(`Members must have joined at least ${policy.minimumMembershipMonths} month(s) ago.`);
    }
  }
  return reasons;
}

export async function individualEligibility(customerId: string, client: Queryable = pool): Promise<EligibilityResult> {
  const policy = await getSetting<MembershipPolicy>('membership_policy', client);
  const member = await one<MemberRow>('SELECT member_number, status, joined_on, verified_at FROM members WHERE customer_id = $1', [customerId], client);
  const reasons = evaluateMember(member, policy);
  return { eligible: reasons.length === 0, reasons, policyConfirmed: policy.confirmedByInstitution };
}

/**
 * A business qualifies when (per policy) at least one verified owner or director is an eligible member,
 * and the person applying is linked to the business with the authority to do so.
 */
export async function businessEligibility(businessId: string, applicantCustomerId: string, client: Queryable = pool): Promise<EligibilityResult> {
  const policy = await getSetting<MembershipPolicy>('membership_policy', client);
  const reasons: string[] = [];

  const business = await one<{ verification_status: string; registered_name: string }>(
    'SELECT verification_status, registered_name FROM businesses WHERE id = $1', [businessId], client,
  );
  if (!business) return { eligible: false, reasons: ['Business not found.'], policyConfirmed: policy.confirmedByInstitution };

  const parties = await many<{
    customer_id: string; role: string; verified: boolean; is_signatory: boolean; name: string;
    authorization_document_id: string | null; auth_doc_status: string | null;
    member_number: string | null; member_status: string | null; joined_on: string | null; member_verified_at: Date | null;
  }>(
    `SELECT p.customer_id, p.role, p.verified, p.is_signatory, c.name, p.authorization_document_id, d.status AS auth_doc_status,
            m.member_number, m.status AS member_status, m.joined_on, m.verified_at AS member_verified_at
       FROM business_parties p
       JOIN customers c ON c.id = p.customer_id
       LEFT JOIN members m ON m.customer_id = p.customer_id
       LEFT JOIN documents d ON d.id = p.authorization_document_id AND d.deleted_at IS NULL
      WHERE p.business_id = $1`,
    [businessId],
    client,
  );

  // 1. The applicant must be linked to the business with authority to apply.
  const applicantRoles = parties.filter(party => party.customer_id === applicantCustomerId);
  const asPrincipal = applicantRoles.find(party => party.role === 'owner' || party.role === 'director');
  const asRepresentative = applicantRoles.find(party => party.role === 'representative');
  if (!asPrincipal && !asRepresentative) {
    reasons.push('You are not linked to this business as an owner, director or authorised representative.');
  } else if (!asPrincipal && asRepresentative) {
    if (!asRepresentative.verified) reasons.push('Your role as representative has not been verified by staff.');
    if (policy.representativeRequiresVerifiedAuthorization && asRepresentative.auth_doc_status !== 'verified') {
      reasons.push('A verified authorisation letter or board resolution is required for representatives.');
    }
  } else if (asPrincipal && !asPrincipal.verified) {
    reasons.push('Your link to this business has not been verified by staff yet.');
  }

  // 2. At least one verified owner/director who is an eligible member.
  if (policy.smeRequiresMemberOwnerOrDirector) {
    const principals = parties.filter(party => (party.role === 'owner' || party.role === 'director') && party.verified);
    const eligiblePrincipal = principals.find(party => evaluateMember(
      party.member_number ? { member_number: party.member_number, status: party.member_status!, joined_on: party.joined_on, verified_at: party.member_verified_at } : null,
      policy,
    ).length === 0);
    if (!principals.length) reasons.push('No owner or director of this business has been verified by staff.');
    else if (!eligiblePrincipal) reasons.push('None of the verified owners or directors is an eligible member.');
  }

  return { eligible: reasons.length === 0, reasons, policyConfirmed: policy.confirmedByInstitution };
}
