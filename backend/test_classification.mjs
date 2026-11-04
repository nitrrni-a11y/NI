import { classifyNarrative, detectSecurityRisk } from './controllers/aiDataController.js';

console.log('--- RUNNING NARRATIVE CLASSIFICATION TEST SUITE ---');

const testCases = [
  // Negative Examples
  {
    name: '1. Single minor complaint',
    narrative: {
      description: 'Minor queue delay at canteen counter during lunch',
      intelligence: 'A student observed slow billing during lunch peak hour.',
      recommendation: 'Add another cashier terminal.',
      topic: 'Campus Life',
      analysis: { claim_count: 1, source_count: 1, sentiment: -0.2 }
    },
    documents: [{ _id: '1', processingText: 'Had to wait 10 minutes at the cafe counter today.' }],
    expected: { direction: 'negative', priority: 'low' }
  },
  {
    name: '2. Repeated hostel accommodation problems',
    narrative: {
      description: 'Persistent hostel water and unhygienic washroom issues',
      intelligence: 'Multiple reports of unhygienic hostel conditions across blocks.',
      recommendation: 'Undertake immediate plumbing inspection and sanitation upgrade.',
      topic: 'Hostel Facilities',
      analysis: { claim_count: 3, source_count: 2, sentiment: -0.6 }
    },
    documents: [
      { _id: '1', processingText: 'Hostel washrooms are dirty and taps have no water.' },
      { _id: '2', processingText: 'Water shortage in hostel B for 3 consecutive days.' }
    ],
    expected: { direction: 'negative', priority: 'high' }
  },
  {
    name: '3. Serious infrastructure issues affecting many students',
    narrative: {
      description: 'Severe drinking water contamination causing widespread student illness',
      intelligence: 'Severe water contamination in main mess resulted in hospitalized students.',
      recommendation: 'Shut down contaminated tank and supply RO water immediately.',
      topic: 'Campus Facilities',
      analysis: { claim_count: 4, source_count: 3, sentiment: -0.8 }
    },
    documents: [{ _id: '1', processingText: 'Water contamination in hostel mess caused severe food poisoning.' }],
    expected: { direction: 'negative', priority: 'high' }
  },
  {
    name: '4. Repeated placement-related dissatisfaction',
    narrative: {
      description: 'Widespread placement crisis and cancelled recruitment drives',
      intelligence: 'Graduating batch reports blacklisted recruiters and cancelled placements.',
      recommendation: 'Engage alumni network and initiate corporate outreach.',
      topic: 'Placements',
      analysis: { claim_count: 4, source_count: 2, sentiment: -0.7 }
    },
    documents: [{ _id: '1', processingText: 'Placement cell failed to bring core companies; zero offers for many.' }],
    expected: { direction: 'negative', priority: 'high' }
  },
  {
    name: '5. Genuine safety incident',
    narrative: {
      description: 'Student allegedly died by suicide in campus hostel',
      intelligence: 'Tragic suicide incident reported in campus hostel.',
      recommendation: 'Provide emergency mental health crisis support.',
      topic: 'Campus Safety',
      analysis: { claim_count: 1, source_count: 1, sentiment: -0.9 }
    },
    documents: [{ _id: '1', processingText: 'Student died by suicide in campus hostel room, police arrived at campus.' }],
    expected: { direction: 'negative', priority: 'critical', isSecurityRisk: true }
  },
  {
    name: '6. Hypothetical or prevention discussion about safety',
    narrative: {
      description: 'Campus hosts suicide prevention workshop and student mental health counseling session',
      intelligence: 'University counseling cell conducted a suicide prevention seminar for new students.',
      recommendation: 'Continue regular wellness workshops.',
      topic: 'Student Welfare',
      analysis: { claim_count: 2, source_count: 1, sentiment: 0.2 }
    },
    documents: [{ _id: '1', processingText: 'Join the campus suicide prevention workshop and awareness campaign on mental health.' }],
    expected: { isSecurityRisk: false, notCritical: true }
  },

  // Positive Examples
  {
    name: '7. Positive feedback about faculty',
    narrative: {
      description: 'Outstanding faculty mentorship and supportive professors in Computer Science',
      intelligence: 'Students consistently praise faculty for extra project guidance and research mentorship.',
      recommendation: 'Expand faculty mentorship model to other departments.',
      topic: 'Academics',
      analysis: { claim_count: 3, source_count: 2, sentiment: 0.6 }
    },
    documents: [{ _id: '1', processingText: 'Professors are very approachable and guide students well.' }],
    expected: { direction: 'positive', positiveSignificance: 'notable', notNegative: true }
  },
  {
    name: '8. Strong placement achievements',
    narrative: {
      description: 'Record-breaking international placement packages and 100% placement rate',
      intelligence: 'Campus achieves highest package of 65 LPA with record recruiter participation.',
      recommendation: 'Document key placement statistics for annual NIRF report.',
      topic: 'Placements',
      analysis: { claim_count: 5, source_count: 3, sentiment: 0.85 }
    },
    documents: [{ _id: '1', processingText: 'Highest international offer reached 1.2 crore with 100% placement.' }],
    expected: { direction: 'positive', positiveSignificance: 'significant', notNegative: true }
  },
  {
    name: '9. Successful campus events',
    narrative: {
      description: 'Highly successful annual cultural and technical fest with massive external participation',
      intelligence: 'Annual cultural festival recorded over 5000 external participants with flawless coordination.',
      recommendation: 'Maintain student festival steering committee structure.',
      topic: 'Campus Events',
      analysis: { claim_count: 3, source_count: 2, sentiment: 0.7 }
    },
    documents: [{ _id: '1', processingText: 'The fest was outstanding and well organized by the student body.' }],
    expected: { direction: 'positive', positiveSignificance: 'notable', notNegative: true }
  },
  {
    name: '10. Significant infrastructure improvements',
    narrative: {
      description: 'Inauguration of state of the art research laboratory and high performance computing center',
      intelligence: 'New advanced supercomputing center inaugurated with multimillion grant.',
      recommendation: 'Schedule multidisciplinary lab access.',
      topic: 'Campus Infrastructure',
      analysis: { claim_count: 2, source_count: 2, sentiment: 0.8 }
    },
    documents: [{ _id: '1', processingText: 'State of the art computing center inaugurated with modern facilities.' }],
    expected: { direction: 'positive', positiveSignificance: 'significant', notNegative: true }
  },
  {
    name: '11. General positive feedback from one student',
    narrative: {
      description: 'Pleasant and green campus atmosphere for evening walks',
      intelligence: 'Student appreciates clean pathways and lush trees on campus.',
      recommendation: 'Maintain campus horticultural upkeep.',
      topic: 'Campus Environment',
      analysis: { claim_count: 1, source_count: 1, sentiment: 0.3 }
    },
    documents: [{ _id: '1', processingText: 'Campus is very green and calm during evenings.' }],
    expected: { direction: 'positive', positiveSignificance: 'general', notNegative: true }
  },

  // Neutral / Mixed Examples
  {
    name: '12. Factual description of admission procedures',
    narrative: {
      description: 'Detailed counseling timeline and document verification schedule for incoming students',
      intelligence: 'Notice outlines reporting dates and required verification documents.',
      recommendation: 'Ensure verification counters are staffed during peak hours.',
      topic: 'Admissions',
      analysis: { claim_count: 1, source_count: 1, sentiment: 0.0 }
    },
    documents: [{ _id: '1', processingText: 'Counseling schedule for BTech admissions published on notice board.' }],
    expected: { direction: 'neutral', priority: 'none' }
  },
  {
    name: '13. Narrative containing both positive and negative experiences',
    narrative: {
      description: 'Excellent academic curriculum and faculty but poor hostel accommodation and food quality',
      intelligence: 'Students express high satisfaction with teaching while reporting dissatisfaction with hostel living conditions.',
      recommendation: 'Prioritize hostel repairs while sustaining academic mentorship.',
      topic: 'Student Experience',
      analysis: { claim_count: 4, source_count: 2, sentiment: -0.05 }
    },
    documents: [
      { _id: '1', processingText: 'Academics and professors are excellent, but hostel food is terrible and rooms are dirty.' }
    ],
    expected: { direction: 'mixed', priority: 'none' }
  },
  {
    name: '14. Factual institutional announcement',
    narrative: {
      description: 'Academic calendar published with semester examination timetable',
      intelligence: 'Notice conveys standard semester dates and registration deadlines.',
      recommendation: 'Ensure calendar is distributed via portal.',
      topic: 'Academic Administration',
      analysis: { claim_count: 1, source_count: 1, sentiment: 0.0 }
    },
    documents: [{ _id: '1', processingText: 'Senate approved the revised academic calendar for the upcoming semester.' }],
    expected: { direction: 'neutral', priority: 'none' }
  }
];

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const risk = detectSecurityRisk(tc.narrative, tc.documents);
  const result = classifyNarrative(tc.narrative, tc.documents, risk);

  let ok = true;
  const errors = [];

  if (tc.expected.direction && result.direction !== tc.expected.direction) {
    ok = false;
    errors.push(`Expected direction "${tc.expected.direction}", got "${result.direction}"`);
  }
  if (tc.expected.priority && result.priority !== tc.expected.priority) {
    ok = false;
    errors.push(`Expected priority "${tc.expected.priority}", got "${result.priority}"`);
  }
  if (tc.expected.positiveSignificance && result.positiveSignificance !== tc.expected.positiveSignificance) {
    ok = false;
    errors.push(`Expected positiveSignificance "${tc.expected.positiveSignificance}", got "${result.positiveSignificance}"`);
  }
  if (tc.expected.isSecurityRisk !== undefined && Boolean(result.isSecurityRisk) !== tc.expected.isSecurityRisk) {
    ok = false;
    errors.push(`Expected isSecurityRisk "${tc.expected.isSecurityRisk}", got "${result.isSecurityRisk}"`);
  }
  if (tc.expected.notCritical && result.priority === 'critical') {
    ok = false;
    errors.push(`Expected NOT critical, but got priority critical`);
  }
  if (tc.expected.notNegative && result.direction === 'negative') {
    ok = false;
    errors.push(`Expected NOT negative, but got direction negative`);
  }

  if (ok) {
    console.log(`[PASS] ${tc.name} -> direction: ${result.direction}, priority: ${result.priority}, sig: ${result.positiveSignificance}`);
    passed++;
  } else {
    console.error(`[FAIL] ${tc.name} ->`, errors.join('; '));
    failed++;
  }
}

console.log(`\nTEST RESULTS: ${passed} PASSED, ${failed} FAILED.`);
if (failed > 0) process.exit(1);

