import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { LockIcon } from "@/components/icons";
import { DelayedLoadingLine } from "@/components/delayed-loading-line";
import type { AvatarColor } from "@/lib/avatar";

export function Screen({
  children,
  glow = false,
  texture = false,
}: {
  children: ReactNode;
  /** A soft, colorful ambient gradient glow behind the screen's content — decorative only. */
  glow?: boolean;
  /** A faint, full-bleed paw-print texture (AC3) sitting above the glow, behind content —
   *  decorative only, opt-in so screens outside this feature's scope don't pick it up. */
  texture?: boolean;
}) {
  const decorated = glow || texture;
  return (
    <div
      className={
        decorated
          ? "relative isolate mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden bg-paper text-ink"
          : "mx-auto flex min-h-screen w-full max-w-md flex-col bg-paper text-ink"
      }
    >
      {glow ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute -top-32 -right-28 size-[420px] rounded-full blur-[100px]"
            style={{ background: "var(--glow-blob-1)", opacity: 0.55 }}
          />
          <div
            className="absolute top-[40%] -left-32 size-[360px] rounded-full blur-[100px]"
            style={{ background: "var(--glow-blob-2)", opacity: 0.4 }}
          />
          <div
            className="absolute -bottom-28 right-[-8%] size-[300px] rounded-full blur-[90px]"
            style={{ background: "var(--glow-blob-3)", opacity: 0.5 }}
          />
        </div>
      ) : null}
      {texture ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage: "var(--texture-paw)",
            backgroundRepeat: "repeat",
            backgroundSize: "160px 160px",
            opacity: 0.14,
          }}
        />
      ) : null}
      {children}
    </div>
  );
}

export function ScreenContent({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`flex-1 px-5 pb-10 ${className}`}>{children}</div>;
}

export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 flex-none bg-gradient-to-t from-paper from-60% to-transparent px-4 pt-3 pb-6">
      {children}
    </div>
  );
}

export function TopBar({
  title,
  leading,
  trailing,
  titleClassName = "text-[16px] font-semibold",
  sticky = false,
}: {
  title: ReactNode;
  leading?: ReactNode;
  /** Opt-in right-hand icon group (e.g. the trip view's action icons) — omitted entirely (not
   *  even an empty wrapper) when unused, so every existing single-title consumer's markup is
   *  byte-for-byte unchanged. */
  trailing?: ReactNode;
  titleClassName?: string;
  /** Sticky, blurred, translucent-paper nav (AC3/AC5/AC6) — content scrolls under it. Opt-in.
   *  Rule (UX consistency review 2026-09-30, finding #11): use on screens with long or
   *  potentially-long scrolling content (a list, a roster, a settlement breakdown) where the nav
   *  staying reachable while scrolled is worth the visual weight — `trip/[id]`, `trip/new`, and
   *  `settle-up` qualify. Screens with a short, mostly-static form (add-expense, edit-expense,
   *  invite, feedback) keep the plain header. */
  sticky?: boolean;
}) {
  const stickyClass = sticky
    ? "sticky top-0 z-20 -mx-5 px-5 py-3 backdrop-blur-xl [background:var(--surface-nav)] [backdrop-filter:blur(24px)_saturate(1.6)]"
    : "px-1 pb-1 pt-5";

  if (trailing) {
    return (
      <div className={`flex items-center justify-between gap-3 ${stickyClass}`}>
        <div className="flex items-center gap-3">
          {leading}
          <span className={titleClassName}>{title}</span>
        </div>
        <div className="flex items-center gap-2">{trailing}</div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${stickyClass}`}>
      {leading}
      <span className={titleClassName}>{title}</span>
    </div>
  );
}

export function IconButton({
  className = "",
  variant = "card",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "card" | "plain" }) {
  const base = variant === "card" ? "bg-white text-ink shadow-card-sm" : "bg-transparent text-ink";
  return (
    <button
      type="button"
      className={`flex size-9 flex-none cursor-pointer items-center justify-center rounded-full ${base} ${className}`}
      {...props}
    />
  );
}

export function IconLinkButton({
  className = "",
  variant = "card",
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> &
  LinkProps & { variant?: "card" | "plain" }) {
  const base = variant === "card" ? "bg-white text-ink shadow-card-sm" : "bg-transparent text-ink";
  return (
    <Link
      className={`flex size-9 flex-none cursor-pointer items-center justify-center rounded-full ${base} ${className}`}
      {...props}
    />
  );
}

type ButtonVariant = "primary" | "accent" | "soft" | "muted" | "ghost" | "capsule" | "capsuleMuted";

/** Shared by `Button` and `LinkButton` — `capsule`/`capsuleMuted` are the floating primary-action
 *  material (design.md section 1): dark ink-translucent fill, blur, elevated shadow, springs up
 *  on first paint. Opt-in, additive variants — every existing `primary`/`accent`/etc. call site
 *  outside this feature's four screens is unaffected. */
const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white",
  accent: "bg-accent text-white",
  soft: "bg-ink/[0.06] text-ink",
  muted: "bg-ink/[0.07] text-ink/70 cursor-default",
  ghost: "bg-transparent text-ink/70",
  capsule: "text-white backdrop-blur-xl [background:var(--surface-capsule)] [box-shadow:var(--shadow-capsule)] animate-capsule-in",
  capsuleMuted:
    "text-ink/70 backdrop-blur-xl [background:var(--surface-capsule-muted)] [box-shadow:var(--shadow-capsule-sm)] cursor-default animate-capsule-in",
};

export function Button({
  variant = "primary",
  className = "",
  block = true,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; block?: boolean }) {
  const variants = buttonVariantClasses;
  return (
    <button
      type="button"
      className={`flex h-14 cursor-pointer items-center justify-center gap-2 rounded-full font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
        block ? "w-full" : ""
      } ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({
  variant = "primary",
  className = "",
  block = true,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> &
  LinkProps & { variant?: ButtonVariant; block?: boolean }) {
  const variants = buttonVariantClasses;
  return (
    <Link
      className={`flex h-14 cursor-pointer items-center justify-center gap-2 rounded-full font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
        block ? "w-full" : ""
      } ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`rounded-card bg-white shadow-card ${className}`}>{children}</div>;
}

export function Divider({ className = "" }: { className?: string }) {
  return <div className={`h-px bg-ink/10 ${className}`} />;
}

export function Kicker({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`text-kicker ${className}`}>{children}</div>;
}

/**
 * Full-screen "this action is blocked because the trip is locked" notice (UX consistency review
 * 2026-09-30, finding #1) — the icon-block-plus-paragraph shape previously duplicated byte-for-
 * byte across add-expense, add-item, and edit-expense. Renders inside the caller's own
 * `ScreenContent`/`TopBar`, not a full replacement shell, so each screen keeps its own close
 * affordance and title.
 */
export function LockedNotice({ children }: { children: ReactNode }) {
  return (
    <>
      <div
        className="flex size-[46px] items-center justify-center rounded-[16px]"
        style={{ background: "var(--color-terracotta-soft)", color: "var(--color-terracotta)" }}
      >
        <LockIcon size={22} />
      </div>
      <div className="h-4" />
      <p className="max-w-[290px] text-[14.5px] leading-[1.5] text-ink/[0.73]">{children}</p>
    </>
  );
}

/**
 * Inline variant of `LockedNotice` (UX consistency review 2026-09-30, finding #1) — a single pill
 * row for use among other controls in a list (e.g. the invite screen's placeholder section),
 * rather than replacing the whole screen.
 */
export function LockedNoticeInline({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center gap-[11px] rounded-[22px] px-[18px] py-3.5"
      style={{ background: "var(--color-terracotta-soft)", color: "var(--color-terracotta)" }}
    >
      <LockIcon size={17} strokeWidth={2.4} />
      <p className="text-[13px] leading-[1.4]">{children}</p>
    </div>
  );
}

/**
 * The blocking fetch-on-mount loading state (UX consistency review 2026-09-30, finding #7) —
 * previously some screens showed the delayed "taking a little longer" reassurance line
 * (`DelayedLoadingLine`) and others didn't, with no stated rule for which. Renders inside the
 * caller's own `Screen`, at the same `pt-14` offset every existing usage already used.
 */
export function ScreenLoading({ label }: { label: string }) {
  return (
    <ScreenContent className="pt-14">
      <p className="text-[15px] text-ink/70">{label}</p>
      <DelayedLoadingLine />
    </ScreenContent>
  );
}

/**
 * The generic fetch-on-mount error state (UX consistency review 2026-09-30, finding #8) —
 * previously every screen but `/join/[code]` dead-ended the user with text and no recovery
 * action, even though the underlying failure (a flaky connection) is exactly as likely to be
 * transient everywhere else. `onRetry` is opt-in so a screen with no retry mechanism (or a
 * terminal error, e.g. "this invite link doesn't match a trip anymore") can still use this for
 * the message layout alone.
 */
export function ScreenError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <ScreenContent className="pt-14">
      <p className="text-[15px] text-ink/70">{message}</p>
      {onRetry ? (
        <>
          <div className="h-3" />
          <Button block={false} variant="soft" className="px-5" onClick={onRetry}>
            Try again
          </Button>
        </>
      ) : null}
    </ScreenContent>
  );
}

export function Field({
  label,
  hint,
  className = "",
  inputClassName = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; inputClassName?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[12px] text-ink/70">
        {label}
        {hint ? <span className="font-normal normal-case tracking-normal text-ink/60"> — {hint}</span> : null}
      </span>
      <input
        className={`h-[54px] w-full rounded-[18px] bg-white px-[18px] text-[16px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink/50 ${inputClassName}`}
        {...props}
      />
    </label>
  );
}

export function Avatar({
  initials,
  color,
  size = 36,
  ring = false,
  className = "",
}: {
  initials: string;
  color: AvatarColor;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`flex flex-none items-center justify-center rounded-full text-[11px] font-semibold ${
        ring ? "border-2 border-white" : ""
      } ${className}`}
      style={{ width: size, height: size, background: color.bg, color: color.fg }}
    >
      {initials}
    </span>
  );
}

const AVATAR_STACK_MAX = 5;

/** Shows at most `max` avatars; any overflow collapses into a single "+N" chip. */
export function AvatarStack({
  members,
  max = AVATAR_STACK_MAX,
}: {
  members: { id: string; initials: string; avatar: AvatarColor }[];
  max?: number;
}) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((m, i) => (
        <Avatar
          key={m.id}
          initials={m.initials}
          color={m.avatar}
          ring
          className={i > 0 ? "-ml-2" : ""}
        />
      ))}
      {extra > 0 ? (
        <Avatar
          initials={`+${extra}`}
          color={{ bg: "var(--color-avatar-placeholder)", fg: "var(--color-ink)" }}
          ring
          className="-ml-2"
        />
      ) : null}
    </div>
  );
}

export function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-2 rounded-full bg-ink/[0.07]">
      <div
        className="h-2 rounded-full"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: color }}
      />
    </div>
  );
}

export function TabSwitch<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex gap-1 rounded-full bg-ink/[0.06] p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`h-10 flex-1 cursor-pointer rounded-full text-[13.5px] font-semibold transition-colors ${
            value === opt.value ? "bg-accent text-white" : "bg-transparent text-ink/70"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The inline destructive confirm that flips a roster row in place (UX consistency review
 * 2026-09-30 finding #5; email-invites design.md section 10 item 3) — previously hand-written
 * once per row kind on the roster. Soft "keep" button + terracotta ghost confirm.
 */
export function ConfirmInlineAction({
  title,
  body,
  bodyClassName = "mt-1 text-[13px] leading-[1.45] text-ink/[0.73]",
  error,
  cancelLabel,
  confirmLabel,
  pendingLabel,
  submitting,
  onCancel,
  onConfirm,
}: {
  title?: ReactNode;
  body?: ReactNode;
  bodyClassName?: string;
  error?: string | null;
  cancelLabel: string;
  confirmLabel: string;
  pendingLabel: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div>
      {title ? <p className="text-[14px] font-semibold">{title}</p> : null}
      {body ? <p className={bodyClassName}>{body}</p> : null}
      {error ? <p className="mt-1.5 text-[12.5px] text-terracotta">{error}</p> : null}
      <div className="mt-2.5 flex gap-2">
        <Button
          variant="soft"
          block={false}
          className="h-[38px] flex-1 text-[13px]"
          onClick={onCancel}
          disabled={submitting}
        >
          {cancelLabel}
        </Button>
        <Button
          variant="ghost"
          block={false}
          className="h-[38px] flex-1 text-[13px]"
          style={{ color: "var(--color-terracotta)" }}
          onClick={onConfirm}
          disabled={submitting}
        >
          {submitting ? pendingLabel : confirmLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * Centred dead-end screen (email-invites design.md section 10 item 5): round icon in the
 * placeholder fill, display headline, body, then the caller's actions. Shared by the trip page's
 * "You're no longer on this trip" (ADR 0012) and the removed email invite (AC19).
 */
export function DeadEndScreen({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  body: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Screen glow texture>
      <ScreenContent className="pt-14 text-center">
        <div
          className="mx-auto flex size-[52px] items-center justify-center rounded-full"
          style={{ background: "var(--color-avatar-placeholder)", color: "var(--color-ink)" }}
        >
          {icon}
        </div>
        <div className="h-4" />
        <h1 className="text-display text-[24px]">{title}</h1>
        <div className="h-2.5" />
        <p className="mx-auto max-w-[300px] text-[14px] leading-[1.5] text-ink/[0.73]">{body}</p>
        {children}
      </ScreenContent>
    </Screen>
  );
}
