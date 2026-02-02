/**
 * Staking API Routes
 * 
 * Endpoints for staking, tiers, and allocation management.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { 
  stakingManager, 
  TIER_CONFIG, 
  StakingTier,
  EARLY_UNSTAKE_PENALTY 
} from '../staking/tiers';
import { 
  allocationManager, 
  POOL_CONFIG, 
  AllocationPool 
} from '../staking/allocation';

const staking = new Hono();

// ============ Tier Info ============

staking.get('/tiers', (c) => {
  return c.json({
    success: true,
    tiers: TIER_CONFIG,
    earlyUnstakePenalty: EARLY_UNSTAKE_PENALTY,
  });
});

staking.get('/tiers/:tier', (c) => {
  const tier = c.req.param('tier') as StakingTier;
  const config = TIER_CONFIG[tier];
  
  if (!config) {
    return c.json({ success: false, error: 'Invalid tier' }, 400);
  }

  const stakers = stakingManager.getStakersByTier(tier);
  
  return c.json({
    success: true,
    tier: config,
    stats: {
      totalStakers: stakers.length,
      totalStaked: stakers.reduce((sum, s) => sum + s.stakedAmount, 0),
      avgSHS: stakers.length > 0
        ? stakers.reduce((sum, s) => sum + s.strongHolderScore, 0) / stakers.length
        : 0,
    },
  });
});

// ============ Staking Operations ============

staking.post('/stake', async (c) => {
  const body = await c.req.json();
  
  const schema = z.object({
    wallet: z.string(),
    amount: z.number().positive(),
    lockDays: z.number().min(0),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ 
      success: false, 
      error: 'Invalid request',
      details: parsed.error.flatten() 
    }, 400);
  }

  const { wallet, amount, lockDays } = parsed.data;
  
  try {
    const position = await stakingManager.stake({ wallet, amount, lockDays });
    const tierConfig = TIER_CONFIG[position.tier];
    
    return c.json({
      success: true,
      message: `Staked ${amount} $LAUNCH for ${lockDays} days`,
      position: {
        wallet: position.wallet,
        stakedAmount: position.stakedAmount,
        tier: position.tier,
        tierEmoji: tierConfig.emoji,
        tierName: tierConfig.name,
        lockEndDate: position.lockEndDate,
        strongHolderScore: position.strongHolderScore,
        effectiveWeight: position.effectiveWeight,
        benefits: {
          allocationWeight: tierConfig.allocationWeight,
          guaranteedAllocation: tierConfig.guaranteedAllocation,
          lotteryBoost: tierConfig.lotteryBoost,
          feeDiscount: `${tierConfig.feeDiscount * 100}%`,
          priorityAccess: tierConfig.priorityAccess,
        },
      },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 400);
  }
});

staking.post('/unstake', async (c) => {
  const body = await c.req.json();
  
  const schema = z.object({
    wallet: z.string(),
    amount: z.number().positive(),
    early: z.boolean().optional().default(false),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid request' }, 400);
  }

  const { wallet, amount, early } = parsed.data;
  
  try {
    const result = await stakingManager.unstake({ wallet, amount, early });
    
    return c.json({
      success: true,
      message: result.penaltyApplied > 0
        ? `Unstaked with ${EARLY_UNSTAKE_PENALTY * 100}% early exit penalty`
        : 'Unstaked successfully',
      amountReturned: result.amountReturned,
      penaltyApplied: result.penaltyApplied,
      newPosition: result.newPosition,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 400);
  }
});

staking.get('/position/:wallet', (c) => {
  const wallet = c.req.param('wallet');
  const position = stakingManager.getPosition(wallet);
  
  if (!position) {
    return c.json({
      success: true,
      position: null,
      tier: 'public',
      message: 'No active staking position. You can still participate in public pools.',
    });
  }

  const tierConfig = TIER_CONFIG[position.tier];
  const daysRemaining = Math.max(
    0,
    Math.ceil((position.lockEndDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  );
  
  return c.json({
    success: true,
    position: {
      ...position,
      tierEmoji: tierConfig.emoji,
      tierName: tierConfig.name,
      daysRemaining,
      canUnstakeWithoutPenalty: daysRemaining === 0,
      benefits: {
        allocationWeight: tierConfig.allocationWeight,
        guaranteedAllocation: tierConfig.guaranteedAllocation,
        lotteryBoost: tierConfig.lotteryBoost,
        feeDiscount: `${tierConfig.feeDiscount * 100}%`,
        priorityAccess: tierConfig.priorityAccess,
        maxAllocationPercent: `${tierConfig.maxAllocationPercent}%`,
      },
    },
  });
});

staking.get('/stats', (c) => {
  const stats = stakingManager.getTierStats();
  const totalStaked = stats.reduce((sum, s) => sum + s.totalStaked, 0);
  const totalStakers = stats.reduce((sum, s) => sum + s.count, 0);
  
  return c.json({
    success: true,
    overview: {
      totalStaked,
      totalStakers,
      avgStakeSize: totalStakers > 0 ? totalStaked / totalStakers : 0,
    },
    byTier: stats.map(s => ({
      ...s,
      tierConfig: TIER_CONFIG[s.tier],
      percentOfTotal: totalStaked > 0 ? (s.totalStaked / totalStaked * 100).toFixed(2) + '%' : '0%',
    })),
  });
});

// ============ Allocation Pool Routes ============

staking.get('/pools', (c) => {
  return c.json({
    success: true,
    pools: Object.entries(POOL_CONFIG).map(([key, config]) => ({
      id: key,
      ...config,
      percentFormatted: `${config.percent}%`,
    })),
  });
});

staking.post('/allocation/init', async (c) => {
  const body = await c.req.json();
  
  const schema = z.object({
    launchId: z.string(),
    totalTokens: z.number().positive(),
    tokenPrice: z.number().positive(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid request' }, 400);
  }

  const launch = allocationManager.initializeLaunch(
    parsed.data.launchId,
    parsed.data.totalTokens,
    parsed.data.tokenPrice
  );

  return c.json({
    success: true,
    message: 'Allocation pools initialized',
    launch: {
      id: launch.launchId,
      totalTokens: launch.totalTokens,
      tokenPrice: launch.tokenPrice,
      pools: Object.entries(launch.pools).map(([key, pool]) => ({
        pool: key,
        tokens: pool.totalTokens,
        valueUSD: pool.totalValueUSD,
        status: pool.status,
      })),
    },
  });
});

staking.post('/allocation/request', async (c) => {
  const body = await c.req.json();
  
  const schema = z.object({
    wallet: z.string(),
    launchId: z.string(),
    pool: z.enum(['guaranteed', 'weighted_lottery', 'public_lottery', 'fcfs', 'flipper']),
    amountUSD: z.number().positive(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid request' }, 400);
  }

  const result = allocationManager.submitRequest(parsed.data as any);
  
  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    message: 'Allocation request submitted',
    entry: result.entry,
  });
});

staking.post('/allocation/open/:launchId/:pool', (c) => {
  const launchId = c.req.param('launchId');
  const pool = c.req.param('pool') as AllocationPool;
  
  allocationManager.openPool(launchId, pool);
  
  return c.json({
    success: true,
    message: `${pool} pool is now open for requests`,
  });
});

staking.post('/allocation/close/:launchId/:pool', (c) => {
  const launchId = c.req.param('launchId');
  const pool = c.req.param('pool') as AllocationPool;
  
  allocationManager.closePool(launchId, pool);
  
  return c.json({
    success: true,
    message: `${pool} pool is now closed`,
  });
});

staking.post('/allocation/execute/:launchId', (c) => {
  const launchId = c.req.param('launchId');
  
  allocationManager.executeAllPools(launchId);
  
  const status = allocationManager.getLaunchStatus(launchId);
  
  return c.json({
    success: true,
    message: 'All allocation pools executed',
    results: status ? {
      participantCount: status.participantCount,
      pools: Object.entries(status.pools).map(([key, pool]) => ({
        pool: key,
        allocated: pool.allocated,
        remaining: pool.remaining,
        winners: pool.participants.filter(p => p.status === 'filled' || p.status === 'won').length,
        losers: pool.participants.filter(p => p.status === 'lost').length,
      })),
    } : null,
  });
});

staking.get('/allocation/:launchId', (c) => {
  const launchId = c.req.param('launchId');
  const status = allocationManager.getLaunchStatus(launchId);
  
  if (!status) {
    return c.json({ success: false, error: 'Launch not found' }, 404);
  }

  return c.json({
    success: true,
    launch: status,
  });
});

staking.get('/allocation/:launchId/user/:wallet', (c) => {
  const launchId = c.req.param('launchId');
  const wallet = c.req.param('wallet');
  
  const allocation = allocationManager.getUserAllocation(launchId, wallet);
  
  return c.json({
    success: true,
    wallet,
    launchId,
    ...allocation,
  });
});

// ============ Simulation / Preview ============

staking.post('/simulate', async (c) => {
  const body = await c.req.json();
  
  const schema = z.object({
    stakeAmount: z.number(),
    lockDays: z.number(),
    holdHistory: z.object({
      holdDuration: z.number(),
      launchesParticipated: z.number(),
      launchesHeldLong: z.number(),
      quickFlips: z.number(),
      lpProvided: z.boolean(),
      governanceVotes: z.number(),
    }).optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid request' }, 400);
  }

  const { stakeAmount, lockDays, holdHistory } = parsed.data;
  
  const tier = stakingManager.getTierForStake(stakeAmount, lockDays);
  const tierConfig = TIER_CONFIG[tier];
  
  let shs = 50;
  if (holdHistory) {
    shs = stakingManager.calculateSHS(holdHistory);
  }
  
  const shsMultiplier = stakingManager.shsToMultiplier(shs);
  const effectiveWeight = tierConfig.allocationWeight * shsMultiplier;
  
  return c.json({
    success: true,
    simulation: {
      input: { stakeAmount, lockDays },
      result: {
        tier,
        tierEmoji: tierConfig.emoji,
        tierName: tierConfig.name,
        strongHolderScore: shs,
        shsMultiplier: shsMultiplier.toFixed(2),
        baseWeight: tierConfig.allocationWeight,
        effectiveWeight: effectiveWeight.toFixed(2),
        benefits: {
          guaranteedAllocation: tierConfig.guaranteedAllocation,
          lotteryBoost: `${tierConfig.lotteryBoost}x`,
          feeDiscount: `${tierConfig.feeDiscount * 100}%`,
          priorityAccess: tierConfig.priorityAccess,
          maxAllocationPercent: `${tierConfig.maxAllocationPercent}%`,
        },
      },
      upgradeHint: tier !== 'diamond' ? getUpgradeHint(tier, stakeAmount, lockDays) : null,
    },
  });
});

function getUpgradeHint(currentTier: StakingTier, amount: number, lockDays: number): string {
  const tiers: StakingTier[] = ['bronze', 'silver', 'gold', 'diamond'];
  const currentIndex = tiers.indexOf(currentTier);
  
  if (currentIndex === -1 || currentIndex === tiers.length - 1) {
    return '';
  }
  
  const nextTier = tiers[currentIndex + 1];
  const nextConfig = TIER_CONFIG[nextTier];
  
  const needsMoreStake = amount < nextConfig.minStake;
  const needsMoreLock = lockDays < nextConfig.lockDays;
  
  if (needsMoreStake && needsMoreLock) {
    return `Stake ${nextConfig.minStake - amount} more tokens and lock for ${nextConfig.lockDays - lockDays} more days to reach ${nextConfig.emoji} ${nextConfig.name}`;
  } else if (needsMoreStake) {
    return `Stake ${nextConfig.minStake - amount} more tokens to reach ${nextConfig.emoji} ${nextConfig.name}`;
  } else if (needsMoreLock) {
    return `Lock for ${nextConfig.lockDays - lockDays} more days to reach ${nextConfig.emoji} ${nextConfig.name}`;
  }
  
  return '';
}

export { staking };
