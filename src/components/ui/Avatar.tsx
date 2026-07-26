import { cn } from "./cn";

/* Meridian §08 avatar — navy-100 disc (teal variant available); with a name it
   renders the .person row. Optional `src` shows a photo with initials fallback. */
const sizes = {
  sm: "sm",
  md: "",
  lg: "lg",
} as const;

export function Avatar({
  initials,
  name,
  subtitle,
  src,
  size = "md",
  teal = false,
  className = "",
}: {
  initials: string;
  name?: string;
  subtitle?: string;
  src?: string | null;
  size?: keyof typeof sizes;
  teal?: boolean;
  className?: string;
}) {
  const mark = src ? (
    // eslint-disable-next-line @next/next/no-img-element -- public avatar URL from Supabase storage
    <img
      src={src}
      alt={name ? `${name} avatar` : "Avatar"}
      className={cn("avatar", sizes[size], "has-photo", className)}
      title={name}
    />
  ) : (
    <span
      className={cn("avatar", sizes[size], teal && "teal", className)}
      aria-hidden={name ? true : undefined}
      title={name}
    >
      {initials.slice(0, 2).toUpperCase()}
    </span>
  );

  if (!name) return mark;

  return (
    <span className="person">
      {mark}
      <span>
        <span className="nm block">{name}</span>
        {subtitle ? <span className="sub2 block">{subtitle}</span> : null}
      </span>
    </span>
  );
}
