/**
 * Password rules, shared by the API (which enforces them) and the web app
 * (which shows them as a live checklist). Keeping one copy means the browser
 * can never accept a password the server will then reject.
 */

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', '1234567890', '12345678910', 'qwertyuiop',
  'qwerty1234', 'iloveyou12', 'welcome123', 'admin12345', 'letmein123', 'pinnacle123', 'malawi2026', 'changeme123',
  'abcdefg123', 'abc1234567', 'passw0rd123',
]);

export const PASSWORD_RULES = 'At least 10 characters, including a letter and a number.';
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordCheck {
  id: 'length' | 'letter' | 'number' | 'common' | 'email' | 'max';
  label: string;
  met: boolean;
}

/** Every rule with whether it is met; `context.email` enables the "doesn't contain your email" rule. */
export function checkPassword(password: string, context: { email?: string } = {}): PasswordCheck[] {
  const lower = password.toLowerCase();
  const emailName = context.email?.split('@')[0]?.toLowerCase() ?? '';
  const checks: PasswordCheck[] = [
    { id: 'length', label: 'At least 10 characters', met: password.length >= 10 },
    { id: 'letter', label: 'At least one letter', met: /[A-Za-z]/.test(password) },
    { id: 'number', label: 'At least one number', met: /[0-9]/.test(password) },
    { id: 'common', label: 'Not a commonly used password', met: password.length > 0 && !COMMON_PASSWORDS.has(lower) },
  ];
  if (emailName.length >= 4) {
    checks.push({ id: 'email', label: 'Does not contain your email name', met: password.length > 0 && !lower.includes(emailName) });
  }
  if (password.length > PASSWORD_MAX_LENGTH) checks.push({ id: 'max', label: `At most ${PASSWORD_MAX_LENGTH} characters`, met: false });
  return checks;
}

/** Messages for the rules that are not met; an empty list means the password is acceptable. */
export function passwordProblems(password: string, context: { email?: string } = {}): string[] {
  const messages: Record<PasswordCheck['id'], string> = {
    length: 'Use at least 10 characters.',
    letter: 'Include at least one letter.',
    number: 'Include at least one number.',
    common: 'This password is too common.',
    email: 'Do not include your email address.',
    max: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  };
  return checkPassword(password, context).filter(check => !check.met).map(check => messages[check.id]);
}
