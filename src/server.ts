/**
 * DiamondPad API Server
 * 
 * The launchpad that rewards believers, not flippers.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { z } from 'zod';
import { BundleDetector } from './detector/bundle';
import { diamondCalculator } from './rewards/diamond';
import { staking } from './routes/staking';
import { 
  CreateLaunchRequest, 
  BuyRequest, 
  DIAMOND_CONFIG,
  Launch,
  Holder
} from './types';

const app = new Hono();

// Initialize services
const bundleDetector = new BundleDetector(
  process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com'
);

// In-memory storage (would be database in production)
const launches: Map<string, Launch> = new Map();
const holders: Map<string, Holder[]> = new Map();
const buyRecords: Map<string, any[]> = new Map();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Mount staking routes
app.route('/api/staking', staking);

// ============ Health & Info ============

app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'diamondpad',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    tagline: 'The launchpad that rewards believers, not flippers 💎'
  });
});

app.get('/api/config', (c) => {
  return c.json({
    success: true,
    config: {
      multipliers: DIAMOND_CONFIG.MULTIPLIERS,
      maxDevAllocation: DIAMOND_CONFIG.MAX_DEV_ALLOCATION,
      minDevVesting: DIAMOND_CONFIG.MIN_DEV_VESTING_MONTHS,
      minLiquidityLock: DIAMOND_CONFIG.MIN_LIQUIDITY_LOCK_MONTHS,
      bundleDetectionThreshold: DIAMOND_CONFIG.BUNDLE_CONFIDENCE_THRESHOLD
    }
  });
});

// ============ Launch Endpoints ============

app.post('/api/launch', async (c) => {
  const body = await c.req.json();
  
  // Validate request
  const schema = z.object({
    name: z.string().min(1).max(32),
    symbol: z.string().min(1).max(10),
    description: z.string().max(500),
    image: z.string().url().optional(),
    totalSupply: z.number().min(1_000_000),
    devAllocation: z.number().max(DIAMOND_CONFIG.MAX_DEV_ALLOCATION),
    devVestingMonths: z.number().min(DIAMOND_CONFIG.MIN_DEV_VESTING_MONTHS),
    liquidityLockMonths: z.number().min(DIAMOND_CONFIG.MIN_LIQUIDITY_LOCK_MONTHS),
    holderRewardsPool: z.number().min(0).max(20),
    creatorWallet: z.string(),
    creatorType: z.enum(['human', 'agent']),
    agentId: z.string().optional()
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ 
      success: false, 
      error: 'Validation failed', 
      details: parsed.error.flatten() 
    }, 400);
  }

  const data = parsed.data;
  
  // Create launch
  const launchId = `launch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const mint = `mint_${Math.random().toString(36).slice(2, 11)}`; // Placeholder
  
  const launch: Launch = {
    id: launchId,
    mint,
    name: data.name,
    symbol: data.symbol,
    description: data.description,
    image: data.image,
    totalSupply: data.totalSupply,
    circulatingSupply: 0,
    devAllocation: data.devAllocation,
    liquidityAllocation: 100 - data.devAllocation - data.holderRewardsPool,
    holderRewardsAllocation: data.holderRewardsPool,
    publicSaleAllocation: 0,
    devVestingMonths: data.devVestingMonths,
    liquidityLockMonths: data.liquidityLockMonths,
    maxWalletPercent: 2,
    status: 'pending',
    createdAt: new Date(),
    creator: data.creatorWallet,
    creatorType: data.creatorType,
    agentId: data.agentId,
    raised: 0,
    holders: 0,
    volume24h: 0,
    priceChange24h: 0
  };

  launches.set(launchId, launch);
  holders.set(launchId, []);
  buyRecords.set(launchId, []);

  return c.json({
    success: true,
    launch: {
      id: launchId,
      mint,
      name: data.name,
      symbol: data.symbol,
      status: 'pending',
      message: 'Launch created. Call /api/launch/:id/activate to go live.'
    }
  });
});

app.get('/api/launch/:id', (c) => {
  const launchId = c.req.param('id');
  const launch = launches.get(launchId);
  
  if (!launch) {
    return c.json({ success: false, error: 'Launch not found' }, 404);
  }

  const launchHolders = holders.get(launchId) || [];
  
  return c.json({
    success: true,
    launch,
    stats: {
      totalHolders: launchHolders.length,
      diamondHands: launchHolders.filter(h => h.holdDurationDays >= 30).length,
      avgHoldDays: launchHolders.length > 0 
        ? launchHolders.reduce((sum, h) => sum + h.holdDurationDays, 0) / launchHolders.length
        : 0
    }
  });
});

app.get('/api/launches', (c) => {
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '20');
  
  let results = Array.from(launches.values());
  
  if (status) {
    results = results.filter(l => l.status === status);
  }
  
  results = results
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);

  return c.json({
    success: true,
    count: results.length,
    launches: results
  });
});

app.post('/api/launch/:id/activate', (c) => {
  const launchId = c.req.param('id');
  const launch = launches.get(launchId);
  
  if (!launch) {
    return c.json({ success: false, error: 'Launch not found' }, 404);
  }
  
  if (launch.status !== 'pending') {
    return c.json({ success: false, error: 'Launch already activated' }, 400);
  }

  launch.status = 'active';
  launch.launchAt = new Date();

  return c.json({
    success: true,
    message: 'Launch is now live!',
    launch
  });
});

// ============ Buy Endpoints ============

app.post('/api/buy', async (c) => {
  const body = await c.req.json();
  
  const schema = z.object({
    launchId: z.string(),
    wallet: z.string(),
    amount: z.number().min(0.001),
    txSignature: z.string()
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid request' }, 400);
  }

  const { launchId, wallet, amount, txSignature } = parsed.data;
  
  const launch = launches.get(launchId);
  if (!launch || launch.status !== 'active') {
    return c.json({ success: false, error: 'Launch not active' }, 400);
  }

  // Record the buy
  const launchBuys = buyRecords.get(launchId) || [];
  const buyRecord = {
    signature: txSignature,
    wallet,
    amount,
    slot: Date.now(), // Would be actual slot
    timestamp: Date.now(),
    launchId
  };
  launchBuys.push(buyRecord);
  buyRecords.set(launchId, launchBuys);

  // Run bundle detection
  const bundleAnalysis = await bundleDetector.analyzeTransaction(
    txSignature,
    launchId,
    launchBuys.slice(-50) // Last 50 buys
  );

  // Update or create holder
  const launchHolders = holders.get(launchId) || [];
  let holder = launchHolders.find(h => h.wallet === wallet);
  
  if (holder) {
    holder.balance += amount * 1_000_000; // Convert to tokens (simplified)
    holder.lastActivityAt = new Date();
  } else {
    holder = {
      wallet,
      launchId,
      balance: amount * 1_000_000,
      costBasis: amount,
      firstBuyAt: new Date(),
      lastActivityAt: new Date(),
      holdDurationDays: 0,
      diamondMultiplier: 1.0,
      rewardsAccrued: 0,
      rewardsClaimed: 0,
      diamondRank: 'Paper',
      globalHolderScore: 0
    };
    launchHolders.push(holder);
    holders.set(launchId, launchHolders);
    launch.holders++;
  }

  // Apply bundle penalty if detected
  let penalty = null;
  if (bundleAnalysis.isBundled) {
    penalty = bundleAnalysis.penaltyApplied;
  }

  return c.json({
    success: true,
    buy: {
      wallet,
      amount,
      tokensReceived: amount * 1_000_000,
      txSignature
    },
    bundleCheck: {
      isBundled: bundleAnalysis.isBundled,
      confidence: bundleAnalysis.confidence,
      action: bundleAnalysis.action,
      penalty
    },
    holder: {
      balance: holder.balance,
      diamondRank: holder.diamondRank,
      multiplier: holder.diamondMultiplier
    }
  });
});

// ============ Holder Endpoints ============

app.get('/api/holder/:wallet', (c) => {
  const wallet = c.req.param('wallet');
  const launchId = c.req.query('launchId');
  
  // Find all holdings for this wallet
  const allHoldings: any[] = [];
  
  holders.forEach((launchHolders, lid) => {
    if (launchId && lid !== launchId) return;
    
    const holder = launchHolders.find(h => h.wallet === wallet);
    if (holder) {
      // Update hold duration
      holder.holdDurationDays = Math.floor(
        (Date.now() - holder.firstBuyAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      holder.diamondRank = diamondCalculator.getDiamondRank(holder.holdDurationDays);
      holder.diamondMultiplier = diamondCalculator.getMultiplier(holder.holdDurationDays);
      
      const launch = launches.get(lid);
      allHoldings.push({
        launch: launch ? { id: lid, name: launch.name, symbol: launch.symbol } : null,
        holder
      });
    }
  });

  if (allHoldings.length === 0) {
    return c.json({ success: false, error: 'No holdings found' }, 404);
  }

  // Calculate global score
  const globalScore = diamondCalculator.calculateGlobalScore(
    allHoldings.map(h => ({
      launchId: h.launch?.id || '',
      holdDays: h.holder.holdDurationDays,
      profitLoss: 0, // Would calculate from price data
      wasRugged: false,
      heldThroughDip: h.holder.holdDurationDays >= 7
    }))
  );

  return c.json({
    success: true,
    wallet,
    globalScore,
    holdings: allHoldings
  });
});

app.get('/api/leaderboard', (c) => {
  const launchId = c.req.query('launchId');
  const limit = parseInt(c.req.query('limit') || '20');
  
  // Collect all holders
  let allHolders: Holder[] = [];
  
  if (launchId) {
    allHolders = holders.get(launchId) || [];
  } else {
    holders.forEach(h => allHolders.push(...h));
  }

  // Update hold durations
  allHolders.forEach(h => {
    h.holdDurationDays = Math.floor(
      (Date.now() - h.firstBuyAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    h.diamondRank = diamondCalculator.getDiamondRank(h.holdDurationDays);
    h.diamondMultiplier = diamondCalculator.getMultiplier(h.holdDurationDays);
  });

  const leaderboard = diamondCalculator.generateLeaderboard(allHolders, launchId || undefined);

  return c.json({
    success: true,
    launchId: launchId || 'all',
    leaderboard: leaderboard.slice(0, limit)
  });
});

// ============ Bundle Detection Endpoints ============

app.get('/api/detect/:txSignature', async (c) => {
  const txSignature = c.req.param('txSignature');
  const launchId = c.req.query('launchId') || '';
  
  const launchBuys = buyRecords.get(launchId) || [];
  
  const analysis = await bundleDetector.analyzeTransaction(
    txSignature,
    launchId,
    launchBuys
  );

  return c.json({
    success: true,
    analysis
  });
});

app.get('/api/bundlers', (c) => {
  return c.json({
    success: true,
    count: bundleDetector.getKnownBundlers().length,
    bundlers: bundleDetector.getKnownBundlers().slice(0, 100)
  });
});

// ============ Rewards Endpoints ============

app.get('/api/rewards/:wallet', (c) => {
  const wallet = c.req.param('wallet');
  const launchId = c.req.query('launchId');
  
  if (!launchId) {
    return c.json({ success: false, error: 'launchId required' }, 400);
  }

  const launchHolders = holders.get(launchId);
  const holder = launchHolders?.find(h => h.wallet === wallet);
  
  if (!holder) {
    return c.json({ success: false, error: 'Holder not found' }, 404);
  }

  // Update hold duration
  holder.holdDurationDays = Math.floor(
    (Date.now() - holder.firstBuyAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const rewards = diamondCalculator.calculateRewards(holder, {
    launchId,
    totalPool: 100_000_000, // Example pool size
    distributed: 0,
    remaining: 100_000_000,
    lastDistributionAt: new Date()
  });

  const projection = diamondCalculator.projectRewards(
    holder.balance,
    holder.holdDurationDays,
    365
  );

  return c.json({
    success: true,
    rewards,
    projection
  });
});

// Start server
const port = parseInt(process.env.PORT || '3000');
console.log(`💎 DiamondPad API starting on port ${port}`);
console.log(`📡 Endpoints:`);
console.log(`   GET  /api/health`);
console.log(`   GET  /api/config`);
console.log(`   POST /api/launch`);
console.log(`   GET  /api/launch/:id`);
console.log(`   GET  /api/launches`);
console.log(`   POST /api/buy`);
console.log(`   GET  /api/holder/:wallet`);
console.log(`   GET  /api/leaderboard`);
console.log(`   GET  /api/detect/:txSignature`);
console.log(`   GET  /api/rewards/:wallet`);
console.log(`   --- Staking ---`);
console.log(`   GET  /api/staking/tiers`);
console.log(`   GET  /api/staking/tiers/:tier`);
console.log(`   POST /api/staking/stake`);
console.log(`   POST /api/staking/unstake`);
console.log(`   GET  /api/staking/position/:wallet`);
console.log(`   GET  /api/staking/stats`);
console.log(`   GET  /api/staking/pools`);
console.log(`   POST /api/staking/allocation/init`);
console.log(`   POST /api/staking/allocation/request`);
console.log(`   GET  /api/staking/allocation/:launchId`);
console.log(`   POST /api/staking/simulate`);

export default {
  port,
  fetch: app.fetch
};
