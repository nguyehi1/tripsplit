import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import type { AvatarColor } from "@/lib/avatar";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-paper text-ink">
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
}: {
  title: string;
  leading?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-1 pb-1 pt-5">
      {leading}
      <span className="text-[16px] font-semibold">{title}</span>
    </div>
  );
}

export function IconButton({
  className = "",
  variant = "card",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "card" | "plain" }) {
  const base =
    variant === "card"
      ? "bg-white text-ink shadow-[0_1px_3px_rgba(35,28,18,0.08)]"
      : "bg-transparent text-ink";
  return (
    <button
      type="button"
      className={`flex size-9 flex-none cursor-pointer items-center justify-center rounded-full ${base} ${className}`}
      {...props}
    />
  );
}

type ButtonVariant = "primary" | "accent" | "soft" | "muted" | "ghost";

export function Button({
  variant = "primary",
  className = "",
  block = true,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; block?: boolean }) {
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-ink text-white",
    accent: "bg-accent text-white",
    soft: "bg-ink/[0.06] text-ink",
    muted: "bg-ink/[0.07] text-ink/70 cursor-default",
    ghost: "bg-transparent text-ink/70",
  };
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

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[22px] bg-white shadow-[0_1px_3px_rgba(35,28,18,0.05),0_8px_22px_rgba(35,28,18,0.05)] ${className}`}
    >
      {children}
    </div>
  );
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
