import mongoose from 'mongoose';
import dns from 'dns';
import dotenv from 'dotenv';
import News from '../models/News.js';

// Fix querySrv ECONNREFUSED on Windows / router DNS for MongoDB Atlas
dns.setServers(['8.8.8.8', '1.1.1.1']);

dotenv.config();

const sampleNewsData = [
  {
    title: 'NIT Raipur Records Exceptional 2026 Placement Statistics with 28% Surge in Tech Offers',
    rawText: 'The Department of Training and Placement at National Institute of Technology Raipur (NITRR) reported a historic high in campus placements this season. Over 120 recruiters visited the campus offering premium packages in software development, core electronics, and analytics. Average CTC for computer science graduates saw a 28% increase compared to last year. Students praised the newly introduced coding preparatory bootcamps for their success.',
    source: 'The Times of India',
    sourceType: 'News Portal',
    author: 'Education Bureau',
    publicationDate: new Date('2026-09-20'),
    topics: ['Placements', 'Career', 'Academics'],
    processingStatus: 'not_processed',
  },
  {
    title: 'Student Forum Discussion: New Placement Drive Rules Boost Coding Confidence',
    rawText: 'Senior students on the NIT Raipur forum discussed how the updated placement criteria helped non-CS students secure top IT product roles. Many students noted that mock interviews conducted by alumni provided realistic interview practice. However, several students requested more core engineering company slots for metallurgy and mining departments.',
    source: 'Student Forum',
    sourceType: 'Social Media',
    author: 'Anonymous Student',
    publicationDate: new Date('2026-09-22'),
    topics: ['Placements', 'Student Life', 'Forum'],
    processingStatus: 'not_processed',
  },
  {
    title: 'NIT Raipur Inaugurates State-of-the-Art AI and Robotics Research Lab',
    rawText: 'National Institute of Technology Raipur has officially unveiled its new Advanced Artificial Intelligence and Robotics Lab funded by central science initiatives. The facility features high-performance NVIDIA GPU clusters aimed at accelerating graduate research in computer vision, autonomous drones, and NLP. Faculty members announced collaborations with international research institutions.',
    source: 'NITRR Official Portal',
    sourceType: 'Institutional',
    author: 'Public Relations Office',
    publicationDate: new Date('2026-09-25'),
    topics: ['Research', 'Artificial Intelligence', 'Innovation'],
    processingStatus: 'not_processed',
  },
  {
    title: 'Alumni Network Commends NIT Raipur Research Modernization Efforts on LinkedIn',
    rawText: 'Distinguished alumni applauded the institute for expanding AI infrastructure and lab equipment. Alumni industry leaders highlighted that hands-on research facilities will make NITRR graduates highly competitive for global PhD programs and research fellowships.',
    source: 'LinkedIn Campus Pulse',
    sourceType: 'Professional Network',
    author: 'Alumni Association',
    publicationDate: new Date('2026-09-27'),
    topics: ['Research', 'Alumni', 'Career'],
    processingStatus: 'not_processed',
  },
  {
    title: 'Hostel Committee Announces Renovation and High-Speed Wi-Fi Rollout Across Hostels',
    rawText: 'Following requests from residential students, the NIT Raipur Hostel Administration has initiated complete Wi-Fi infrastructure upgrades and mess facility improvements across Sirpur, Kotumsar, and Malhar hostels. Students expressed satisfaction with the prompt responsiveness of the administration.',
    source: 'Campus Gazette',
    sourceType: 'Campus News',
    author: 'Chief Warden Office',
    publicationDate: new Date('2026-09-28'),
    topics: ['Campus Life', 'Hostel', 'Infrastructure'],
    processingStatus: 'not_processed',
  }
];

const seedNews = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected to Atlas.');

    // Count existing news
    const count = await News.countDocuments();
    if (count > 0) {
      console.log(`Database already has ${count} news documents. Adding fresh sample items...`);
    }

    const inserted = await News.insertMany(sampleNewsData);
    console.log(`Successfully seeded ${inserted.length} sample news articles into Atlas!`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding news:', error);
    process.exit(1);
  }
};

seedNews();
