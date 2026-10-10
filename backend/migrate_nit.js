import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import connectDB from './config/db.js';
import Entity from './models/Entity.js';
import Document from './models/Document.js';
import Narrative from './models/Narrative.js';
import ProcessingJob from './models/ProcessingJob.js';
import Topic from './models/Topic.js';

dotenv.config();

const migrate = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await connectDB();
    console.log('Connected.');

    // 1. Check if NIT Raipur entity already exists
    let entity = await Entity.findOne({ name: 'NIT Raipur' });
    if (!entity) {
      console.log('Creating default NIT Raipur entity...');
      entity = new Entity({
        entityId: `ENT_${uuidv4().replace(/-/g, '').substring(0, 8)}`,
        name: 'NIT Raipur',
        entityType: 'Institution',
        domain: 'Education',
        description: 'Default entity created from legacy data.'
      });
      await entity.save();
      console.log('Created Entity:', entity.entityId);
    } else {
      console.log('Found existing Entity:', entity.entityId);
    }

    const aId = entity.entityId;

    // 2. Update Documents
    console.log('Updating Documents...');
    const docResult = await Document.updateMany(
      { entityId: { $exists: false } },
      { $set: { entityId: aId } }
    );
    console.log(`Updated ${docResult.modifiedCount} documents.`);

    // 3. Update Narratives
    console.log('Updating Narratives...');
    const narResult = await Narrative.updateMany(
      { entityId: { $exists: false } },
      { $set: { entityId: aId } }
    );
    console.log(`Updated ${narResult.modifiedCount} narratives.`);

    // 4. Update ProcessingJobs
    console.log('Updating ProcessingJobs...');
    const jobResult = await ProcessingJob.updateMany(
      { entityId: { $exists: false } },
      { $set: { entityId: aId } }
    );
    console.log(`Updated ${jobResult.modifiedCount} processing jobs.`);

    // 5. Extract distinct topics and create Topic documents
    console.log('Extracting and creating Topics...');
    const distinctTopics = await Narrative.distinct('topic', { entityId: aId });
    for (const t of distinctTopics) {
      if (!t || t === 'Unknown') continue;
      
      const existingTopic = await Topic.findOne({ entityId: aId, name: t });
      if (!existingTopic) {
        const topic = new Topic({
          topicId: `TOP_${uuidv4().replace(/-/g, '').substring(0, 8)}`,
          entityId: aId,
          name: t
        });
        await topic.save();
        console.log(`Created topic: ${t}`);
      }
    }

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migrate();
