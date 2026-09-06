// GuidanceProviderAdapter — V2 Business Growth Hub.
// Provider-independent contract for AI-assisted growth guidance.
//
// DEFAULT implementation: static curated guidance content per journey
// stage and opportunity category. No live LLM calls — no credit cost.
// An LLM-backed implementation can be plugged in by replacing the
// getGuidance function body to call InvokeLLM with context-aware prompts.

/**
 * Get growth guidance for a journey stage and opportunity type.
 * @param {string} stage - build | grow | scale
 * @param {string} opportunityType - profile | customer | promotional | business
 * @param {Object} context - { displayName, headline, subscriptionTier, profileComplete }
 * @returns {Promise<Object>} { title, body, tips: string[] }
 */
export async function getGuidance(stage, opportunityType, context = {}) {
  // ── DEFAULT: static curated guidance ──
  const key = `${stage}.${opportunityType}`;
  const guidance = STATIC_GUIDANCE[key] || STATIC_GUIDANCE['build.profile'];

  // Light personalisation with context — no LLM call
  return {
    title: guidance.title,
    body: guidance.body.replace('{name}', context.displayName || 'there'),
    tips: guidance.tips,
  };
}

const STATIC_GUIDANCE = {
  'build.profile': {
    title: 'Build Your Professional Presence',
    body: 'A complete profile is the foundation of discovery on Interactive. {name}, clients find you through your profile — make sure it tells your story clearly.',
    tips: [
      'Add a professional headshot and cover image',
      'Write a clear headline that describes what you offer',
      'List your services and specialisms so clients can filter to you',
      'Set your service area so local clients can find you',
    ],
  },
  'build.customer': {
    title: 'Start Building Your Client Base',
    body: 'Your first clients come from being discoverable and approachable. Focus on making it easy for people to book you.',
    tips: [
      'Set up your availability so clients can book you directly',
      'Share your profile link on your social channels',
      'Ask early clients for reviews and trust signals',
      'Respond to booking enquiries promptly',
    ],
  },
  'build.promotional': {
    title: 'Begin Promoting Your Services',
    body: 'Even at the Build stage, simple promotions help you reach your first clients. Start with what your plan allows.',
    tips: [
      'Create your first campaign to boost a key service',
      'Share posts about your services to the community feed',
      'Use your free promotional credits if available',
    ],
  },
  'build.business': {
    title: 'Establish Your Business Operations',
    body: 'Set up the operational foundations that let you scale later. Good processes now mean smooth growth later.',
    tips: [
      'Define your services and pricing clearly',
      'Set up your calendar and availability rules',
      'Configure your booking and payment settings',
    ],
  },
  'grow.profile': {
    title: 'Strengthen Your Profile for Growth',
    body: 'As you grow, your profile should reflect your track record. {name}, update it with your latest achievements.',
    tips: [
      'Add gallery images showing your work',
      'Update your headline with your growing reputation',
      'Collect and display trust signals from clients',
      'Keep your services and specialisms current',
    ],
  },
  'grow.customer': {
    title: 'Expand Your Client Acquisition',
    body: 'Growing means reaching more clients. Use a mix of organic discovery and targeted promotion.',
    tips: [
      'Create campaigns to boost high-value services',
      'Encourage satisfied clients to leave reviews',
      'Post regularly to stay visible in the feed',
      'Consider expanding your service area',
    ],
  },
  'grow.promotional': {
    title: 'Scale Your Promotional Activity',
    body: 'With a growing plan, you can run multiple campaigns and reach wider audiences.',
    tips: [
      'Run campaigns for different services simultaneously',
      'Use audience targeting to reach local clients',
      'Track campaign performance and adjust your budget',
      'Boost your best-performing events and workouts',
    ],
  },
  'grow.business': {
    title: 'Optimise Your Business Operations',
    body: 'Growth brings operational complexity. Streamline now to maintain quality at scale.',
    tips: [
      'Review your booking flow for bottlenecks',
      'Use business analytics to identify your best services',
      'Consider adding staff to handle increased demand',
      'Set up recurring availability patterns',
    ],
  },
  'scale.profile': {
    title: 'Position as an Established Expert',
    body: 'At scale, your profile should reflect your full track record and expertise. {name}, you are a leader in your field.',
    tips: [
      'Showcase your biggest achievements and milestones',
      'Highlight your most advanced specialisms',
      'Use your gallery to demonstrate range and quality',
      'Maintain verification to signal trust',
    ],
  },
  'scale.customer': {
    title: 'Maximise Client Retention and Referrals',
    body: 'At scale, growth comes from retention and referrals as much as acquisition.',
    tips: [
      'Maintain high response rates to keep clients happy',
      'Use trust signals to build credibility at scale',
      'Create loyalty through consistent service quality',
      'Leverage your network for referrals',
    ],
  },
  'scale.promotional': {
    title: 'Run Sophisticated Campaign Portfolios',
    body: 'Scale your promotional strategy with advanced targeting and multiple concurrent campaigns.',
    tips: [
      'Run campaigns across all your service lines',
      'Use advanced audience targeting for precision',
      'Analyse campaign ROI and reallocate budget',
      'Promote your best events and content',
    ],
  },
  'scale.business': {
    title: 'Scale Your Business Operations',
    body: 'At scale, operational excellence is your competitive advantage. Invest in systems and team.',
    tips: [
      'Use business insights to guide strategic decisions',
      'Build a team and delegate effectively',
      'Automate repetitive operational tasks',
      'Monitor cash flow and business performance closely',
    ],
  },
};