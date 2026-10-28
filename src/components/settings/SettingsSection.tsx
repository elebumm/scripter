import type { ReactNode } from "react";

interface SettingsSectionProps {
  id: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

export function SettingsSection({ id, title, description, action, children }: SettingsSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 rounded-2xl border border-stone-200/80 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={`${id}-title`}
            className="text-lg font-bold text-stone-900"
            style={{ fontFamily: "var(--font-cabinet)" }}
          >
            {title}
          </h2>
          {description && (
            <p className="text-sm text-stone-500 mt-1" style={{ fontFamily: "var(--font-switzer)" }}>
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Small uppercase label used across settings rows. */
export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[11px] font-semibold tracking-wider uppercase text-stone-600"
      style={{ fontFamily: "var(--font-inter)" }}
    >
      {children}
    </label>
  );
}
