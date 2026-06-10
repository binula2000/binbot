# Lab Inventory & Logistics System

A highly visual, 3D-mapped Lab Inventory system. Instead of simple lists, this software uses an interactive 3D environment to precisely track the location of biological samples, chemicals, and equipment down to the exact shelf or grid in a freezer.

## Features
- **3D Architectural Mapping**: Dynamically build your lab space, spawn benches, cabinets, and freezers.
- **Advanced Storage Hierarchies**: Define internal grid topologies for freezers and mount 10x10 vial archive boxes.
- **Hardware Scanner Integration**: Built-in support for hardware barcode scanners (e.g., Zebra DS2208) to rapidly scan in/out inventory.
- **Interactive Global Stock**: A comprehensive ledger of all items mapped alongside the interactive 3D map for location-specific filtering.

## Installation

### Prerequisites
- Node.js (v18 or higher recommended)
- npm (Node Package Manager)

### Setup

1. **Clone the repository** (if you haven't already):
   ```bash
   git clone https://github.com/binula2000/binbot.git
   cd binbot
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Initialize the Database**:
   This project uses Prisma with a local SQLite database (`dev.db`). You need to generate the Prisma client and push the schema to ensure the database is ready.
   ```bash
   npx prisma generate
   npx prisma db push
   ```

## Running the Application

To start the local development server:
```bash
npm run dev
```
Once the server starts, open your browser and navigate to [http://localhost:3000](http://localhost:3000) to view the application.

## Updating Remotely

To pull the latest changes from the GitHub repository and ensure your local database is in sync:
```bash
# Pull the latest code
git pull origin main

# Reinstall dependencies just in case there were updates
npm install

# Update the database schema and regenerate the client
npx prisma generate
npx prisma db push

# Restart your server
npm run dev
```
