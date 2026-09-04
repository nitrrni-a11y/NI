import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

// Load env vars
dotenv.config();

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected.');

    // 1. Delete incorrect accounts
    const incorrectEmails = ['admin@gmail.com', 'admin@nitrr.ac.in'];
    await User.deleteMany({ email: { $in: incorrectEmails } });
    console.log(`Deleted any accounts matching: ${incorrectEmails.join(', ')}`);

    // 2. Setup correct admin
    const adminEmail = 'pallevinayreddy18@gmail.com';
    const adminPassword = '12345678';
    const adminName = 'Palle Vinay Reddy';

    const adminExists = await User.findOne({ email: adminEmail });
    
    if (adminExists) {
      console.log('Admin user exists. Updating details to ensure correctness...');
      adminExists.name = adminName;
      adminExists.role = 'admin';
      adminExists.password = adminPassword; // pre-save hook will hash it
      await adminExists.save();
      console.log('Admin user updated successfully!');
    } else {
      await User.create({
        name: adminName,
        email: adminEmail,
        password: adminPassword,
        role: 'admin',
      });
      console.log('Admin user created successfully!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

createAdmin();
