import * as React from "react";
import Link from "next/link";
import { FolderOpen, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, type buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

export interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
}

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  /** Legacy alias for title/description for backward-compatibility */
  message?: string;
  description?: string;
  icon?: LucideIcon | React.ComponentType<{ className?: string }> | React.ReactNode;
  action?: EmptyStateAction | React.ReactNode;
  secondaryAction?: EmptyStateAction | React.ReactNode;
  variant?: "default" | "card" | "dashed" | "compact";
  children?: React.ReactNode;
}

function isActionConfig(action: unknown): action is EmptyStateAction {
  return (
    typeof action === "object" &&
    action !== null &&
    "label" in action &&
    typeof (action as EmptyStateAction).label === "string"
  );
}

function renderAction(action: EmptyStateAction | React.ReactNode, key?: string) {
  if (!action) return null;

  if (isActionConfig(action)) {
    const Icon = action.icon;
    const content = (
      <>
        {Icon && <Icon className="mr-2 size-4" />}
        <span>{action.label}</span>
      </>
    );

    if (action.href) {
      return (
        <Link key={key} href={action.href}>
          <Button variant={action.variant || "default"}>{content}</Button>
        </Link>
      );
    }

    return (
      <Button
        key={key}
        variant={action.variant || "default"}
        onClick={action.onClick}
      >
        {content}
      </Button>
    );
  }

  return <React.Fragment key={key}>{action}</React.Fragment>;
}

export function EmptyState({
  title,
  message,
  description,
  icon: IconProp,
  action,
  secondaryAction,
  variant = "default",
  className,
  children,
  ...props
}: EmptyStateProps) {
  const displayTitle = title || message || "No items found";
  const displayDescription = description || (title && message ? message : undefined);

  const renderIcon = () => {
    if (React.isValidElement(IconProp)) {
      return IconProp;
    }

    if (typeof IconProp === "function" || (typeof IconProp === "object" && IconProp !== null)) {
      const CustomIcon = IconProp as React.ComponentType<{ className?: string }>;
      return <CustomIcon className="size-8 text-foreground/70" />;
    }

    return <FolderOpen className="size-8 text-foreground/70" />;
  };

  const variantStyles = {
    default: "py-12 px-4 text-center",
    card: "brutal-border brutal-shadow bg-card p-8 sm:p-12 text-center",
    dashed: "border-2 border-dashed border-foreground/20 p-8 sm:p-12 text-center bg-card/40",
    compact: "py-8 px-4 text-center",
  };

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center text-foreground",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      <div className="mb-4 flex size-16 items-center justify-center rounded-none border-[3px] border-foreground bg-primary/10 brutal-shadow">
        {renderIcon()}
      </div>

      <h3 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        {displayTitle}
      </h3>

      {displayDescription && (
        <p className="mt-2 max-w-md text-sm text-muted-foreground sm:text-base">
          {displayDescription}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {renderAction(action, "primary")}
          {renderAction(secondaryAction, "secondary")}
        </div>
      )}

      {children && <div className="mt-6 w-full">{children}</div>}
    </div>
  );
}

export default EmptyState;
