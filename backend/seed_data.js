import dotenv from 'dotenv';
import connectDB from './config/db.js';
import Domain from './models/Domain.js';
import Entity from './models/Entity.js';
import User from './models/User.js';

dotenv.config();

const domainsToSeed = [
  "Education",
  "Corporate & Workplace",
  "Technology & Products",
  "Healthcare",
  "Government & Public Services",
  "Politics & Public Opinion",
  "Finance & Banking",
  "Retail & Consumer Brands",
  "Travel & Hospitality",
  "Media & Entertainment"
];

const entitiesToSeed = [
  { name: "NIT Raipur", domain: "Education", entityType: "Institution" },
  { name: "IIT Delhi", domain: "Education", entityType: "Institution" },
  { name: "ZS Associates", domain: "Corporate & Workplace", entityType: "Company" },
  { name: "Deloitte", domain: "Corporate & Workplace", entityType: "Company" },
  { name: "iPhone", domain: "Technology & Products", entityType: "Product" },
  { name: "Samsung Galaxy", domain: "Technology & Products", entityType: "Product" }
];

const seedData = async () => {
  try {
    await connectDB();
    console.log('MongoDB Connected');

    // Seed Domains
    for (const d of domainsToSeed) {
      await Domain.updateOne(
        { name: d },
        { $setOnInsert: { name: d, description: `${d} Intelligence Domain` } },
        { upsert: true }
      );
    }
    console.log('Domains seeded');

    // Seed Entities (if not existing)
    // For NIT Raipur, since it exists already from previous tests, we might want to ensure it has correct domain
    for (const e of entitiesToSeed) {
      const entityId = e.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      await Entity.updateOne(
        { entityId },
        { 
          $set: { domain: e.domain, entityType: e.entityType }, 
          $setOnInsert: { name: e.name } 
        },
        { upsert: true }
      );
    }
    console.log('Entities seeded');

    // Seed Admin User
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || '12345678';
    const adminName = process.env.ADMIN_NAME || 'System Admin';

    const existingAdmin = await User.findOne({ email: adminEmail });
    if (!existingAdmin) {
      await User.create({
        name: adminName,
        email: adminEmail,
        password: adminPassword,
        role: 'admin',
      });
      console.log(`Admin user created: ${adminEmail}`);
    } else {
      console.log(`Admin user already exists: ${adminEmail}`);
    }

    console.log('Data seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

seedData();
