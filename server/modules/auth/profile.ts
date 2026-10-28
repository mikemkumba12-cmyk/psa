import { one, type Queryable, pool } from '../../db/pool';
import { loadEffectivePermissions } from '../../auth/permissions';

/** The signed-in user's profile as the portal sees it. Never includes hashes. */
export async function loadProfile(userId: string, client: Queryable = pool) {
  const user = await one(
    `SELECT id, role, name, email, phone, staff_title, approval_limit, notification_prefs,
            must_change_password, created_at, last_login_at, password_changed_at, data_source
       FROM users WHERE id = $1`,
    [userId],
    client,
  );
  if (!user) return null;

  const customer = await one(
    `SELECT c.id, c.name, c.phone, c.email, c.address, c.national_id, c.employee_number, c.date_of_birth,
            c.gender, c.employment_type, c.employer_name, c.monthly_income, c.segment, c.location,
            m.id AS member_id, m.member_number, m.status AS member_status, m.joined_on AS member_joined_on,
            m.verified_at AS member_verified_at
       FROM customers c
       LEFT JOIN members m ON m.customer_id = c.id
      WHERE c.user_id = $1`,
    [userId],
    client,
  );

  const permissions = [...await loadEffectivePermissions(userId, user.role, client)].sort();
  const passkeys = await one<{ count: number }>(
    'SELECT count(*)::int AS count FROM webauthn_credentials WHERE user_id = $1',
    [userId],
    client,
  );

  return {
    id: user.id,
    role: user.role,
    fullName: user.name,
    email: user.email,
    phone: user.phone,
    staffTitle: user.staff_title,
    approvalLimit: user.approval_limit,
    notificationPrefs: user.notification_prefs,
    mustChangePassword: user.must_change_password,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    passwordChangedAt: user.password_changed_at,
    isDemoAccount: user.data_source !== 'live',
    passkeyCount: passkeys?.count ?? 0,
    permissions,
    customer: customer && {
      id: customer.id,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      nationalId: customer.national_id,
      employeeNumber: customer.employee_number,
      dateOfBirth: customer.date_of_birth,
      gender: customer.gender,
      employmentType: customer.employment_type,
      employerName: customer.employer_name,
      monthlyIncome: customer.monthly_income,
      segment: customer.segment,
      district: customer.location,
      membership: customer.member_id
        ? {
            id: customer.member_id,
            memberNumber: customer.member_number,
            status: customer.member_status,
            joinedOn: customer.member_joined_on,
            verifiedAt: customer.member_verified_at,
          }
        : null,
    },
  };
}

export type Profile = NonNullable<Awaited<ReturnType<typeof loadProfile>>>;
