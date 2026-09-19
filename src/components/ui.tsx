import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
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
  /** Sticky, blurred, translucent-paper nav (AC3/AC5/AC6) — content scrolls under it. Opt-in so
   *  screens outside this feature's scope keep today's plain, non-sticky header. */
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

export function AvatarStack({
  members,
}: {
  members: { id: string; initials: string; avatar: AvatarColor }[];
}) {
  return (
    <div className="flex items-center">
      {members.map((m, i) => (
        <Avatar
          key={m.id}
          initials={m.initials}
          color={m.avatar}
          ring
          className={i > 0 ? "-ml-2" : ""}
        />
      ))}
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
