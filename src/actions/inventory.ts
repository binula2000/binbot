'use server';

import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

// Get the system status of an item by UPC
export async function scanItem(upc: string) {
  const product = await prisma.product.findUnique({
    where: { upc },
    include: {
      inventories: {
        include: { location: true }
      }
    }
  });

  return product;
}

// Get all locations
export async function getLocations() {
  return prisma.location.findMany();
}

export async function receiveManualItem(upc: string, name: string, quantity: number, locationId: string, vendor: string) {
  const result = await prisma.$transaction(async (tx) => {
    let product = await tx.product.findUnique({ where: { upc } });
    if (!product) {
      product = await tx.product.create({
        data: { name, upc }
      });
    }

    const inventory = await tx.inventory.findUnique({
      where: { productId_locationId: { productId: product.id, locationId } }
    });

    if (inventory) {
      await tx.inventory.update({
        where: { id: inventory.id },
        data: { quantity: { increment: quantity } }
      });
    } else {
      await tx.inventory.create({
        data: { quantity, productId: product.id, locationId }
      });
    }
    return product;
  });

  revalidatePath('/');
  return result;
}

// Increment stock of an existing item
export async function incrementStock(productId: string, locationId: string, amount: number = 1) {
  const inventory = await prisma.inventory.findUnique({
    where: {
      productId_locationId: { productId, locationId }
    }
  });

  if (inventory) {
    await prisma.inventory.update({
      where: { id: inventory.id },
      data: { quantity: { increment: amount } }
    });
  } else {
    await prisma.inventory.create({
      data: { quantity: amount, productId, locationId }
    });
  }

  revalidatePath('/');
  return true;
}

// Decrement stock (Disposal Mode)
export async function disposeItem(upc: string) {
  const product = await prisma.product.findUnique({
    where: { upc },
    include: { inventories: true }
  });

  if (!product || product.inventories.length === 0) {
    throw new Error("Product not found in inventory.");
  }

  // Simplification: remove 1 from the first location we find it in
  // A real app might ask the user *which* fridge they are pulling it from if it's in multiple
  const inventory = product.inventories[0];

  if (inventory.quantity > 0) {
    await prisma.inventory.update({
      where: { id: inventory.id },
      data: { quantity: { decrement: 1 } }
    });
  }
  
  revalidatePath('/');
  return product;
}

export async function getFullInventory() {
  return prisma.inventory.findMany({
    include: {
      product: true,
      location: true
    },
    orderBy: {
      product: { name: 'asc' }
    }
  });
}

export async function setInventoryStock(inventoryId: string, newQuantity: number) {
  if (newQuantity < 0) newQuantity = 0;
  
  await prisma.inventory.update({
    where: { id: inventoryId },
    data: { quantity: newQuantity }
  });

  revalidatePath('/');
  return true;
}

export async function removeInventoryItem(inventoryId: string) {
  await prisma.inventory.delete({
    where: { id: inventoryId }
  });
  
  revalidatePath('/');
  return true;
}

export async function updateLocationTransform(locationId: string, transformData: string) {
  await prisma.location.update({
    where: { id: locationId },
    data: { transformData }
  });
  revalidatePath('/');
  return true;
}

export async function addLocation(name: string, type: string, config?: string) {
  // Give it a generic starting position near the center
  const newLocation = await prisma.location.create({
    data: {
      name,
      type,
      config,
      transformData: "[-2, 0, -2, 0]"
    }
  });
  revalidatePath('/');
  return newLocation;
}

export async function addStorageBox(name: string, locationId: string, cellIndex: string) {
  const box = await prisma.storageBox.create({
    data: { name, locationId, cellIndex }
  });
  revalidatePath('/');
  return box;
}

export async function getBoxesByLocation(locationId: string) {
  return prisma.storageBox.findMany({ where: { locationId } });
}

export async function removeLocation(locationId: string) {
  // We must delete the inventory items residing at this location first
  await prisma.inventory.deleteMany({
    where: { locationId }
  });
  // Then delete the location itself
  await prisma.location.delete({
    where: { id: locationId }
  });
  revalidatePath('/');
  return true;
}

export async function getLabSettings() {
  let settings = await prisma.labSettings.findUnique({
    where: { id: 'global' }
  });
  if (!settings) {
    settings = await prisma.labSettings.create({
      data: { id: 'global' }
    });
  }
  return settings;
}

export async function saveLabSettings(stationX: number, stationZ: number, isSetupComplete: boolean) {
  const data = {
    stationX,
    stationZ,
    isSetupComplete
  };

  const settings = await prisma.labSettings.upsert({
    where: { id: 'global' },
    update: data,
    create: { id: 'global', ...data }
  });
  
  revalidatePath('/');
  return settings;
}

export async function addArchitectureRoom(width: number, length: number, isMain: boolean = false, offsetX: number = 0, offsetZ: number = 0, rotation: number = 0) {
  const room = await prisma.architectureRoom.create({
    data: { width, length, isMain, offsetX, offsetZ, rotation }
  });
  revalidatePath('/');
  return room;
}

export async function getArchitectureRooms() {
  return prisma.architectureRoom.findMany();
}

export async function resetLabBlueprint() {
  await prisma.architectureRoom.deleteMany({});
  await prisma.labSettings.update({
    where: { id: 'global' },
    data: { isSetupComplete: false }
  });
  revalidatePath('/');
  return true;
}
