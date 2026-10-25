import React, { useId, useState } from 'react';
import { Check, Circle, Eye, EyeOff } from 'lucide-react';
import { checkPassword } from '../../shared/passwordPolicy';

const CONTROL = 'block w-full min-w-0 rounded-lg border bg-surface px-3 text-ink placeholder:text-ink-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-surface-muted disabled:text-ink-subtle';

function controlClass(invalid: boolean, extra = ''): string {
  return `${CONTROL} ${invalid ? 'border-danger-600 focus:border-danger-600' : 'border-line-strong focus:border-brand-600'} ${extra}`;
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
  className?: string;
}

/** Label, control, hint and error message wired together for screen readers. */
export function Field({ label, error, hint, required, children, className = '' }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-danger-700" aria-hidden> *</span>}
      </label>
      {children({ id, describedBy: [hintId, errorId].filter(Boolean).join(' ') || undefined, invalid: Boolean(error) })}
      {hint && !error && <p id={hintId} className="mt-1.5 text-xs text-ink-muted">{hint}</p>}
      {error && <p id={errorId} className="mt-1.5 text-xs font-medium text-danger-700" role="alert">{error}</p>}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: React.ReactNode; fieldClassName?: string };

export function TextInput({ label, error, hint, required, fieldClassName, className = '', ...rest }: InputProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} required={required}
          className={controlClass(invalid, `h-11 sm:h-10 ${className}`)} {...rest} />
      )}
    </Field>
  );
}

/**
 * Password field with a show/hide toggle. Pass `rules` to show the live checklist
 * of password requirements (the same rules the server enforces).
 */
export function PasswordInput({ label, error, hint, required, fieldClassName, className = '', rules, ...rest }: Omit<InputProps, 'type'> & {
  rules?: { email?: string };
}) {
  const [visible, setVisible] = useState(false);
  const value = String(rest.value ?? '');
  const checks = rules ? checkPassword(value, rules) : [];
  return (
    <Field label={label} error={error} hint={rules ? undefined : hint} required={required} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <>
          <div className="relative">
            <input id={id} type={visible ? 'text' : 'password'} aria-describedby={[describedBy, rules ? `${id}-rules` : ''].filter(Boolean).join(' ') || undefined}
              aria-invalid={invalid || undefined} required={required} autoCapitalize="none" autoCorrect="off" spellCheck={false}
              className={controlClass(invalid, `h-11 pr-11 sm:h-10 ${className}`)} {...rest} />
            <button type="button" onClick={() => setVisible(current => !current)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink-muted hover:text-ink"
              aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={visible} aria-controls={id}>
              {visible ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
            </button>
          </div>
          {rules && (
            <ul id={`${id}-rules`} className="mt-2 space-y-1 text-xs" aria-live="polite">
              {checks.map(check => (
                <li key={check.id} className={`flex items-center gap-1.5 ${check.met ? 'text-success-700' : 'text-ink-muted'}`}>
                  {check.met ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                  <span>{check.label}<span className="sr-only">{check.met ? ' (met)' : ' (not met)'}</span></span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Field>
  );
}

/** Number input for money; shows the currency and keeps the numeric keypad on phones. */
export function MoneyInput({ label, error, hint, value, onValueChange, required, fieldClassName, ...rest }: Omit<InputProps, 'value' | 'onChange'> & {
  value: number | '' | null | undefined; onValueChange: (value: number | '') => void;
}) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-muted">MWK</span>
          <input id={id} inputMode="decimal" type="number" min={0} step="any" aria-describedby={describedBy} aria-invalid={invalid || undefined}
            required={required} value={value ?? ''} onChange={event => onValueChange(event.target.value === '' ? '' : Number(event.target.value))}
            className={controlClass(invalid, 'h-11 sm:h-10 pl-14 tabular-nums')} {...rest} />
        </div>
      )}
    </Field>
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: React.ReactNode; fieldClassName?: string; options: Array<{ value: string; label: string }>; placeholder?: string };

export function Select({ label, error, hint, options, placeholder, required, fieldClassName, className = '', ...rest }: SelectProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <select id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} required={required}
          className={controlClass(invalid, `h-11 sm:h-10 pr-8 ${className}`)} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      )}
    </Field>
  );
}

type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: React.ReactNode; fieldClassName?: string };

export function TextArea({ label, error, hint, required, fieldClassName, className = '', rows = 4, ...rest }: TextAreaProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <textarea id={id} rows={rows} aria-describedby={describedBy} aria-invalid={invalid || undefined} required={required}
          className={controlClass(invalid, `py-2 ${className}`)} {...rest} />
      )}
    </Field>
  );
}

export function Checkbox({ label, description, checked, onChange, disabled, id: givenId }: {
  label: React.ReactNode; description?: React.ReactNode; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; id?: string;
}) {
  const generated = useId();
  const id = givenId || generated;
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-strong accent-brand-600" />
      <label htmlFor={id} className="min-w-0 text-sm">
        <span className="font-medium text-ink">{label}</span>
        {description && <span className="block text-ink-muted">{description}</span>}
      </label>
    </div>
  );
}

/** Lays fields out in one column on phones and two from tablet width up. */
export function FormGrid({ children, columns = 2 }: { children: React.ReactNode; columns?: 1 | 2 | 3 }) {
  const cols = columns === 1 ? '' : columns === 3 ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2';
  return <div className={`grid grid-cols-1 gap-4 ${cols}`}>{children}</div>;
}

/** Shows server field errors that don't belong to any visible input. */
export function FormErrorSummary({ message, details, visibleFields = [] }: { message?: string; details?: Array<{ field: string; message: string }>; visibleFields?: string[] }) {
  if (!message) return null;
  const extra = (details || []).filter(detail => !visibleFields.includes(detail.field));
  return (
    <div role="alert" className="rounded-lg border border-danger-600/30 bg-danger-50 p-3 text-sm text-danger-700">
      <p className="font-semibold">{message}</p>
      {extra.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
          {extra.map((detail, index) => <li key={index} className="break-words">{detail.message}</li>)}
        </ul>
      )}
    </div>
  );
}
