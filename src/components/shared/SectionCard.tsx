import type { ReactNode } from "react";

export function SectionCard({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink/10 px-5 py-4">
        <div>
          <p className="ontology-label">Research Object</p>
          <h2 className="mt-1 text-lg font-semibold tracking-normal text-ink">{title}</h2>
          {description ? <p className="mt-2 max-w-5xl text-sm leading-6 text-ink/55">{description}</p> : null}
        </div>
        {badge}
      </div>
      <div className="px-5 pb-5 pt-5">{children}</div>
    </section>
  );
}
