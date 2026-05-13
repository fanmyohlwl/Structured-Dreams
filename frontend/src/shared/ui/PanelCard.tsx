import type { PropsWithChildren, ReactNode } from "react";

interface PanelCardProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function PanelCard({
  title,
  subtitle,
  actions,
  children,
  className,
}: PanelCardProps) {
  return (
    <section className={className ? `panel-card ${className}` : "panel-card"}>
      <header className="panel-card__header">
        <div
          className={`panel-card__heading${
            subtitle ? " panel-card__heading--has-tooltip" : ""
          }`}
          data-tooltip={subtitle}
          title={subtitle}
        >
          <h2 className="panel-card__title">{title}</h2>
          {subtitle ? (
            <span className="panel-card__info-badge" aria-hidden="true">
              ?
            </span>
          ) : null}
        </div>
        {actions ? <div className="panel-card__actions">{actions}</div> : null}
      </header>
      <div className="panel-card__body">{children}</div>
    </section>
  );
}
