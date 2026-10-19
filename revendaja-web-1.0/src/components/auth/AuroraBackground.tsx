// Fundo decorativo das telas de autenticação: faixas diagonais desfocadas em tons da marca,
// inspirado no efeito "aurora" de telas de login modernas (ex.: Stripe), mas na paleta da
// Revendaja — laranja (primary) como protagonista, com coral/pêssego para dar movimento e um
// toque de índigo frio no canto oposto para profundidade (evita ficar "doce" demais).
// Puro CSS (gradientes + blur), sem JS: performático e não compete com o card de formulário.
export function AuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-canvas" aria-hidden="true">
      {/* Faixa 1 — a maior, pêssego -> laranja -> coral, diagonal principal */}
      <div
        className="absolute -left-1/4 -top-1/3 h-[65vh] w-[150vw] opacity-80 mix-blend-multiply blur-[90px]"
        style={{
          background: 'linear-gradient(100deg, #ffe4cc 0%, #ff8b33 32%, #ff6b00 55%, #ff3d6e 80%, transparent 100%)',
          transform: 'rotate(-18deg)',
        }}
      />
      {/* Faixa 2 — coral -> índigo, cruza a primeira perto do centro para dar profundidade fria */}
      <div
        className="absolute -right-1/3 top-1/4 h-[55vh] w-[130vw] opacity-70 mix-blend-multiply blur-[90px]"
        style={{
          background: 'linear-gradient(100deg, transparent 0%, #ff3d6e 30%, #c23b8f 55%, #4c4fd5 85%, transparent 100%)',
          transform: 'rotate(-18deg)',
        }}
      />
      {/* Glow suave atrás do card para garantir contraste de leitura no centro */}
      <div
        className="absolute left-1/2 top-1/2 h-[70vh] w-[70vh] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50 blur-[110px]"
        style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
      />
      {/* Textura de grão bem sutil para tirar o aspecto "gradiente digital liso" */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.035] mix-blend-overlay">
        <filter id="aurora-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#aurora-grain)" />
      </svg>
    </div>
  );
}
