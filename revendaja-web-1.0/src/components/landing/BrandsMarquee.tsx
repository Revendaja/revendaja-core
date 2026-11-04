const BASE_URL = 'https://revendaja-dev.s3.sa-east-1.amazonaws.com/estoqueproprio/brands';

// Marcas do catálogo do sistema (prisma/seed/brands.json); color = cor principal, usada na borda.
const BRANDS = [
  { name: 'Natura', file: 'logo-natura.png', color: '#f58220' },
  { name: 'O Boticário', file: 'logo-oboticario.png', color: '#4e8a6b' },
  { name: 'Avon', file: 'logo-avon.png', color: '#e5007e' },
  { name: 'Eudora', file: 'logo-eudora.png', color: '#3f3c8f' },
  { name: 'Jequiti', file: 'logo-jequiti.png', color: '#6b2a7a' },
  { name: 'Hinode', file: 'logo-hinode.png', color: '#c9a227' },
  { name: 'Quem Disse, Berenice?', file: 'logo-quem-disse-berenice.png', color: '#d6203a' },
  { name: 'O.U.i', file: 'o.u.i.jpg', color: '#a4123f' },
];

function Row({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-6 pr-6">
      {BRANDS.map((brand) => (
        <li key={brand.name}>
          {/* eslint-disable-next-line @next/next/no-img-element -- logos pequenos do S3, sem necessidade de otimização */}
          <img
            src={`${BASE_URL}/${brand.file}`}
            alt={hidden ? '' : brand.name}
            title={brand.name}
            width={64}
            height={64}
            loading="lazy"
            style={{ borderColor: brand.color }}
            className="h-16 w-16 rounded-full border-2 bg-white object-contain p-1.5 transition duration-300 hover:scale-110"
          />
        </li>
      ))}
    </ul>
  );
}

export function BrandsMarquee() {
  return (
    <section className="bg-black py-20 text-center text-white md:py-28">
      <p className="mb-10 px-6 text-sm text-white/60">
        Todas as marcas que você revende, num só lugar
      </p>
      <div className="brands-marquee mx-auto flex w-full max-w-7xl overflow-hidden px-6 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <div className="brands-track flex">
          <Row />
          <Row hidden />
          <Row hidden />
          <Row hidden />
        </div>
      </div>
    </section>
  );
}
