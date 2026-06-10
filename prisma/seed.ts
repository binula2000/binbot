import { PrismaClient } from '@prisma/client';
import "dotenv/config";

const prisma = new PrismaClient();

async function main() {
  console.log("Clearing database...");
  await prisma.inventory.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.pendingOrder.deleteMany({});

  console.log("Seeding Location data...");
  const fridge1 = await prisma.location.create({
    data: { name: 'Main Refrigerator', room: 'Lab A', type: 'Fridge', transformData: '[-2.5, 0, -2, 0]' }
  });
  const shelf1 = await prisma.location.create({
    data: { name: 'Chemicals Shelf A', room: 'Lab B', type: 'Shelf', transformData: '[2.5, 0, 1, 0]' }
  });

  console.log("Seeding Product data...");
  const p1 = await prisma.product.create({
    data: { name: 'Ethanol 95%', sku: 'ETH-95', upc: '123456789012', description: 'Solvent' }
  });

  const p2 = await prisma.product.create({
    data: { name: 'Taq Polymerase', sku: 'TAQ-01', upc: '098765432109', description: 'PCR Enzyme' }
  });

  console.log("Seeding Inventory data...");
  await prisma.inventory.create({
    data: { quantity: 10, productId: p1.id, locationId: shelf1.id }
  });

  await prisma.inventory.create({
    data: { quantity: 5, productId: p2.id, locationId: fridge1.id }
  });

  console.log("Seeding PendingOrders data...");
  await prisma.pendingOrder.create({
    data: { productName: 'Petri Dishes', quantity: 100, vendor: 'ThermoFisher' }
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
