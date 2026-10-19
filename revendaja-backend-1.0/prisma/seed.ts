import brands from './seed/brands.json';
import products from './seed/products.json';
import { prisma } from '../src/database/prisma';

const BATCH_SIZE = 1000;

async function seedBrands(): Promise<void> {
  for (const brand of brands) {
    await prisma.brand.upsert({
      where: { id: brand.id },
      update: brand,
      create: brand,
    });
  }
  console.warn(`Marcas: ${brands.length} sincronizadas.`);
}

async function seedProducts(): Promise<void> {
  for (let offset = 0; offset < products.length; offset += BATCH_SIZE) {
    // ~5 mil produtos do dump vêm com `basePrice: null`, mas a coluna é NOT NULL.
    // O próprio dump já usa 0 para "sem preço sugerido" (e cada loja define o
    // preço dela ao importar o produto), então null vira 0 em vez de ficar de fora.
    const batch = products
      .slice(offset, offset + BATCH_SIZE)
      .map((product) => ({ ...product, basePrice: product.basePrice ?? 0 }));
    await prisma.product.createMany({ data: batch, skipDuplicates: true });
    console.warn(`Produtos: ${Math.min(offset + BATCH_SIZE, products.length)}/${products.length}`);
  }
}

// As marcas e os produtos do catálogo são inseridos com ids fixos (vindos do
// dump original), então a sequence do Postgres usada pelo @default(autoincrement())
// precisa ser realinhada para o próximo id livre — senão a primeira marca/produto
// criado manualmente depois do seed colidiria com um id já existente.
async function realignSequence(table: 'brands' | 'products'): Promise<void> {
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`,
  );
}

async function main(): Promise<void> {
  await seedBrands();
  await realignSequence('brands');

  await seedProducts();
  await realignSequence('products');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
