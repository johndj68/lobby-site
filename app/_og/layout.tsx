interface OGLayoutProps {
  logoSrc: string
  title: string
  subtitle: string
}

// Shared JSX layout for all LOBBY OG images.
// Exported as a plain function (not a React component) so Satori receives
// a raw JSX element — no hooks, no context, no React runtime needed.
export function OGLayout({ logoSrc, title, subtitle }: OGLayoutProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'flex-start',
        backgroundColor: '#05070D',
        padding: '64px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* top accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: 'linear-gradient(90deg, #005BFF 0%, #00A3FF 50%, #7B2CFF 100%)',
          display: 'flex',
        }}
      />

      {/* radial glow — top right */}
      <div
        style={{
          position: 'absolute',
          top: '-160px',
          right: '-160px',
          width: '640px',
          height: '640px',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(0,91,255,0.18) 0%, rgba(123,44,255,0.08) 50%, transparent 70%)',
          display: 'flex',
        }}
      />

      {/* dot grid — decorative */}
      <div
        style={{
          position: 'absolute',
          top: '60px',
          right: '60px',
          display: 'flex',
          flexWrap: 'wrap',
          width: '180px',
          gap: '18px',
        }}
      >
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              backgroundColor: `rgba(0,91,255,${0.08 + (i % 5) * 0.06})`,
            }}
          />
        ))}
      </div>

      {/* logo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc}
        width={128}
        height={64}
        style={{ objectFit: 'contain', marginBottom: '48px' }}
        alt=""
      />

      {/* headline */}
      <div
        style={{
          fontSize: '56px',
          fontWeight: 700,
          color: '#ffffff',
          lineHeight: 1.15,
          marginBottom: '20px',
          maxWidth: '780px',
          letterSpacing: '-1px',
        }}
      >
        {title}
      </div>

      {/* subtitle */}
      <div
        style={{
          fontSize: '24px',
          color: 'rgba(255,255,255,0.55)',
          fontWeight: 400,
          maxWidth: '680px',
        }}
      >
        {subtitle}
      </div>

      {/* bottom-right accent lines */}
      <div
        style={{
          position: 'absolute',
          bottom: '64px',
          right: '64px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          alignItems: 'flex-end',
        }}
      >
        <div
          style={{
            width: '80px',
            height: '3px',
            background: 'linear-gradient(90deg, transparent, #005BFF)',
            borderRadius: '2px',
          }}
        />
        <div
          style={{
            width: '48px',
            height: '3px',
            background: 'linear-gradient(90deg, transparent, #00A3FF)',
            borderRadius: '2px',
          }}
        />
        <div
          style={{
            width: '24px',
            height: '3px',
            background: 'linear-gradient(90deg, transparent, #7B2CFF)',
            borderRadius: '2px',
          }}
        />
      </div>
    </div>
  )
}
