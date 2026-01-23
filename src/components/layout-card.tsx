type LayoutCardProps = {
  name: string;
  description: string;
  locked?: boolean;
  href: string;
};

export function LayoutCard({ name, description, locked, href }: LayoutCardProps) {
  return (
    <a
      className="card"
      style={{
        position: "relative",
        display: "block",
        padding: "18px",
        minHeight: "160px"
      }}
      href={href}
    >
      <div className="pill" style={{ marginBottom: 12 }}>
        {locked ? "Per proprietari registrati" : "Anteprima"}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{name}</div>
      <div className="text-muted" style={{ lineHeight: 1.5 }}>{description}</div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: locked
            ? "linear-gradient(180deg, rgba(14,75,88,0.14), transparent 60%)"
            : "transparent",
          borderRadius: 20
        }}
      />
    </a>
  );
}
