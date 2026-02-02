/**
 * Allocation Pool System
 * 
 * Distributes launch allocations across different pools:
 * - Guaranteed (35%): Diamond/Gold stakers, pro-rata by weight
 * - Weighted Lottery (25%): All stakers, weighted by tier + SHS
 * - Public Lottery (10%): Anyone, simple lottery
 * - FCFS Micro (5%): First come first serve, $100 cap
 * - Flipper Pool (5%): Explicit degen pool, 5% exit fee
 * - Liquidity (15%): Auto-locked to DEX
 * - Trader Rewards (10%): Post-launch volume incentives
 */

import { StakerPosition, StakingTier, TIER_CONFIG, stakingManager } from './tiers';

// ============ Types ============

export type AllocationPool = 
  | 'guaranteed' 
  | 'weighted_lottery' 
  | 'public_lottery' 
  | 'fcfs' 
  | 'flipper' 
  | 'liquidity' 
  | 'trader_rewards';

export interface PoolConfig {
  name: string;
  percent: number;              // % of total launch allocation
  requiresStaking: boolean;
  minTier: StakingTier | null;  // null = no tier requirement
  maxPerWallet: number;         // Max allocation per wallet (in USD or tokens)
  mechanism: 'prorata' | 'lottery' | 'fcfs' | 'auto';
  vestingDays: number;          // 0 = immediate unlock
  exitFee: number;              // % fee for early exit
}

export interface LaunchAllocation {
  launchId: string;
  totalTokens: number;
  tokenPrice: number;           // Price per token in USD
  pools: Record<AllocationPool, PoolAllocation>;
  participantCount: number;
  oversubscribed: boolean;
  oversubscriptionRatio: number;
}

export interface PoolAllocation {
  pool: AllocationPool;
  totalTokens: number;
  totalValueUSD: number;
  allocated: number;
  remaining: number;
  participants: AllocationEntry[];
  status: 'pending' | 'open' | 'closed' | 'distributed';
}

export interface AllocationEntry {
  wallet: string;
  pool: AllocationPool;
  requestedAmount: number;      // In USD
  allocatedTokens: number;
  allocatedValueUSD: number;
  weight: number;               // For weighted calculations
  lotteryTickets: number;       // For lottery pools
  vestingSchedule: VestingSchedule | null;
  status: 'pending' | 'won' | 'lost' | 'filled';
}

export interface VestingSchedule {
  totalTokens: number;
  releasedTokens: number;
  cliffDays: number;
  vestingDays: number;
  startDate: Date;
  releases: {
    date: Date;
    amount: number;
    released: boolean;
  }[];
}

export interface AllocationRequest {
  wallet: string;
  launchId: string;
  pool: AllocationPool;
  amountUSD: number;
}

// ============ Configuration ============

export const POOL_CONFIG: Record<AllocationPool, PoolConfig> = {
  guaranteed: {
    name: 'Guaranteed Allocation',
    percent: 30,                // Reduced from 35% to balance
    requiresStaking: true,
    minTier: 'gold',           // Only Diamond and Gold
    maxPerWallet: 25000,       // $25k max per wallet
    mechanism: 'prorata',
    vestingDays: 0,            // Tiered vesting based on allocation size
    exitFee: 0,
  },
  weighted_lottery: {
    name: 'Weighted Lottery',
    percent: 25,
    requiresStaking: true,
    minTier: 'bronze',         // Bronze and above
    maxPerWallet: 5000,
    mechanism: 'lottery',
    vestingDays: 0,
    exitFee: 0,
  },
  public_lottery: {
    name: 'Public Lottery',
    percent: 10,
    requiresStaking: false,
    minTier: null,
    maxPerWallet: 500,         // Small allocation for non-stakers
    mechanism: 'lottery',
    vestingDays: 0,
    exitFee: 0,
  },
  fcfs: {
    name: 'First Come First Serve',
    percent: 5,
    requiresStaking: false,
    minTier: null,
    maxPerWallet: 100,         // Micro allocation
    mechanism: 'fcfs',
    vestingDays: 0,
    exitFee: 0,
  },
  flipper: {
    name: 'Flipper Pool',
    percent: 5,
    requiresStaking: false,
    minTier: null,
    maxPerWallet: 200,
    mechanism: 'lottery',
    vestingDays: 0,
    exitFee: 0.05,             // 5% exit fee within 24h
  },
  liquidity: {
    name: 'Liquidity Reserve',
    percent: 15,
    requiresStaking: false,
    minTier: null,
    maxPerWallet: 0,
    mechanism: 'auto',
    vestingDays: 365,          // Locked 1 year
    exitFee: 0,
  },
  trader_rewards: {
    name: 'Trader Rewards',
    percent: 10,
    requiresStaking: false,
    minTier: null,
    maxPerWallet: 0,
    mechanism: 'auto',
    vestingDays: 30,           // Distributed over 30 days post-launch
    exitFee: 0,
  },
};

// Vesting rules based on allocation size
export const VESTING_TIERS = [
  { maxUSD: 500, cliffDays: 0, vestingDays: 0, tgePercent: 100 },
  { maxUSD: 2000, cliffDays: 0, vestingDays: 30, tgePercent: 50 },
  { maxUSD: 10000, cliffDays: 7, vestingDays: 60, tgePercent: 25 },
  { maxUSD: Infinity, cliffDays: 14, vestingDays: 90, tgePercent: 20 },
];

// ============ Allocation Manager ============

export class AllocationManager {
  private launches: Map<string, LaunchAllocation> = new Map();
  private requests: Map<string, AllocationRequest[]> = new Map(); // launchId -> requests

  /**
   * Initialize allocation pools for a launch
   */
  initializeLaunch(
    launchId: string,
    totalTokens: number,
    tokenPrice: number
  ): LaunchAllocation {
    const pools: Record<AllocationPool, PoolAllocation> = {} as any;
    
    for (const [pool, config] of Object.entries(POOL_CONFIG)) {
      const poolTokens = Math.floor(totalTokens * (config.percent / 100));
      pools[pool as AllocationPool] = {
        pool: pool as AllocationPool,
        totalTokens: poolTokens,
        totalValueUSD: poolTokens * tokenPrice,
        allocated: 0,
        remaining: poolTokens,
        participants: [],
        status: 'pending',
      };
    }

    const launch: LaunchAllocation = {
      launchId,
      totalTokens,
      tokenPrice,
      pools,
      participantCount: 0,
      oversubscribed: false,
      oversubscriptionRatio: 1,
    };

    this.launches.set(launchId, launch);
    this.requests.set(launchId, []);
    
    return launch;
  }

  /**
   * Submit allocation request
   */
  submitRequest(request: AllocationRequest): {
    success: boolean;
    error?: string;
    entry?: AllocationEntry;
  } {
    const launch = this.launches.get(request.launchId);
    if (!launch) {
      return { success: false, error: 'Launch not found' };
    }

    const poolConfig = POOL_CONFIG[request.pool];
    const pool = launch.pools[request.pool];

    if (pool.status !== 'open') {
      return { success: false, error: 'Pool not open for requests' };
    }

    // Validate request against pool rules
    const validation = this.validateRequest(request, poolConfig);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Check max per wallet
    if (request.amountUSD > poolConfig.maxPerWallet) {
      request.amountUSD = poolConfig.maxPerWallet;
    }

    // Calculate weight/tickets
    const position = stakingManager.getPosition(request.wallet);
    const weight = position?.effectiveWeight || TIER_CONFIG.public.allocationWeight;
    const lotteryBoost = stakingManager.getLotteryBoost(request.wallet);

    const entry: AllocationEntry = {
      wallet: request.wallet,
      pool: request.pool,
      requestedAmount: request.amountUSD,
      allocatedTokens: 0,
      allocatedValueUSD: 0,
      weight,
      lotteryTickets: Math.floor(request.amountUSD * lotteryBoost),
      vestingSchedule: null,
      status: 'pending',
    };

    pool.participants.push(entry);
    
    const requests = this.requests.get(request.launchId) || [];
    requests.push(request);
    this.requests.set(request.launchId, requests);

    return { success: true, entry };
  }

  /**
   * Validate allocation request
   */
  private validateRequest(
    request: AllocationRequest,
    poolConfig: PoolConfig
  ): { valid: boolean; error?: string } {
    // Check staking requirement
    if (poolConfig.requiresStaking) {
      const position = stakingManager.getPosition(request.wallet);
      if (!position) {
        return { valid: false, error: 'Staking required for this pool' };
      }

      // Check tier requirement
      if (poolConfig.minTier) {
        const tierOrder: StakingTier[] = ['public', 'bronze', 'silver', 'gold', 'diamond'];
        const minIndex = tierOrder.indexOf(poolConfig.minTier);
        const userIndex = tierOrder.indexOf(position.tier);
        
        if (userIndex < minIndex) {
          return { 
            valid: false, 
            error: `Minimum tier required: ${poolConfig.minTier}. Your tier: ${position.tier}` 
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Execute guaranteed allocation (pro-rata)
   */
  executeGuaranteedPool(launchId: string): void {
    const launch = this.launches.get(launchId);
    if (!launch) return;

    const pool = launch.pools.guaranteed;
    if (pool.participants.length === 0) return;

    // Calculate total weight
    const totalWeight = pool.participants.reduce((sum, p) => sum + p.weight, 0);

    // Distribute pro-rata by weight
    for (const participant of pool.participants) {
      const share = participant.weight / totalWeight;
      const allocatedTokens = Math.floor(pool.totalTokens * share);
      const allocatedUSD = allocatedTokens * launch.tokenPrice;

      // Cap at max requested
      const finalTokens = Math.min(
        allocatedTokens,
        Math.floor(participant.requestedAmount / launch.tokenPrice)
      );
      const finalUSD = finalTokens * launch.tokenPrice;

      participant.allocatedTokens = finalTokens;
      participant.allocatedValueUSD = finalUSD;
      participant.status = 'filled';
      participant.vestingSchedule = this.createVestingSchedule(finalUSD, finalTokens);

      pool.allocated += finalTokens;
    }

    pool.remaining = pool.totalTokens - pool.allocated;
    pool.status = 'distributed';
  }

  /**
   * Execute lottery pool
   */
  executeLotteryPool(launchId: string, pool: AllocationPool): void {
    const launch = this.launches.get(launchId);
    if (!launch) return;

    const poolData = launch.pools[pool];
    if (poolData.participants.length === 0) return;

    // Build lottery pool with tickets
    const tickets: string[] = [];
    for (const participant of poolData.participants) {
      for (let i = 0; i < participant.lotteryTickets; i++) {
        tickets.push(participant.wallet);
      }
    }

    // Shuffle tickets
    for (let i = tickets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tickets[i], tickets[j]] = [tickets[j], tickets[i]];
    }

    // Draw winners until pool exhausted
    const winners = new Set<string>();
    let remainingTokens = poolData.totalTokens;
    const poolConfig = POOL_CONFIG[pool];

    for (const wallet of tickets) {
      if (remainingTokens <= 0) break;
      if (winners.has(wallet)) continue;

      const participant = poolData.participants.find(p => p.wallet === wallet);
      if (!participant) continue;

      const maxTokens = Math.floor(poolConfig.maxPerWallet / launch.tokenPrice);
      const requestedTokens = Math.floor(participant.requestedAmount / launch.tokenPrice);
      const allocatedTokens = Math.min(maxTokens, requestedTokens, remainingTokens);

      participant.allocatedTokens = allocatedTokens;
      participant.allocatedValueUSD = allocatedTokens * launch.tokenPrice;
      participant.status = 'won';
      participant.vestingSchedule = this.createVestingSchedule(
        participant.allocatedValueUSD,
        allocatedTokens
      );

      poolData.allocated += allocatedTokens;
      remainingTokens -= allocatedTokens;
      winners.add(wallet);
    }

    // Mark non-winners
    for (const participant of poolData.participants) {
      if (participant.status === 'pending') {
        participant.status = 'lost';
      }
    }

    poolData.remaining = remainingTokens;
    poolData.status = 'distributed';
  }

  /**
   * Execute FCFS pool
   */
  executeFCFSPool(launchId: string): void {
    const launch = this.launches.get(launchId);
    if (!launch) return;

    const pool = launch.pools.fcfs;
    const poolConfig = POOL_CONFIG.fcfs;

    // Sort by request time (first come)
    const requests = this.requests.get(launchId) || [];
    const fcfsRequests = requests
      .filter(r => r.pool === 'fcfs')
      .sort((a, b) => 0); // Would sort by timestamp

    let remainingTokens = pool.totalTokens;

    for (const request of fcfsRequests) {
      if (remainingTokens <= 0) break;

      const participant = pool.participants.find(p => p.wallet === request.wallet);
      if (!participant) continue;

      const maxTokens = Math.floor(poolConfig.maxPerWallet / launch.tokenPrice);
      const allocatedTokens = Math.min(maxTokens, remainingTokens);

      participant.allocatedTokens = allocatedTokens;
      participant.allocatedValueUSD = allocatedTokens * launch.tokenPrice;
      participant.status = 'filled';

      pool.allocated += allocatedTokens;
      remainingTokens -= allocatedTokens;
    }

    // Mark unfilled as lost
    for (const participant of pool.participants) {
      if (participant.status === 'pending') {
        participant.status = 'lost';
      }
    }

    pool.remaining = remainingTokens;
    pool.status = 'distributed';
  }

  /**
   * Create vesting schedule based on allocation size
   */
  private createVestingSchedule(amountUSD: number, tokens: number): VestingSchedule {
    const tier = VESTING_TIERS.find(t => amountUSD <= t.maxUSD) || VESTING_TIERS[VESTING_TIERS.length - 1];
    
    if (tier.vestingDays === 0) {
      // No vesting - immediate unlock
      return {
        totalTokens: tokens,
        releasedTokens: tokens,
        cliffDays: 0,
        vestingDays: 0,
        startDate: new Date(),
        releases: [{
          date: new Date(),
          amount: tokens,
          released: true,
        }],
      };
    }

    const releases: VestingSchedule['releases'] = [];
    const tgeAmount = Math.floor(tokens * (tier.tgePercent / 100));
    const vestingAmount = tokens - tgeAmount;
    
    // TGE release
    releases.push({
      date: new Date(),
      amount: tgeAmount,
      released: false,
    });

    // Vesting releases (linear over vesting period)
    const vestingReleases = 4; // Quarterly releases
    const releaseAmount = Math.floor(vestingAmount / vestingReleases);
    const releaseInterval = tier.vestingDays / vestingReleases;

    for (let i = 0; i < vestingReleases; i++) {
      const daysFromStart = tier.cliffDays + (releaseInterval * (i + 1));
      releases.push({
        date: new Date(Date.now() + daysFromStart * 24 * 60 * 60 * 1000),
        amount: i === vestingReleases - 1 ? vestingAmount - (releaseAmount * (vestingReleases - 1)) : releaseAmount,
        released: false,
      });
    }

    return {
      totalTokens: tokens,
      releasedTokens: 0,
      cliffDays: tier.cliffDays,
      vestingDays: tier.vestingDays,
      startDate: new Date(),
      releases,
    };
  }

  /**
   * Execute all pools for a launch
   */
  executeAllPools(launchId: string): void {
    this.executeGuaranteedPool(launchId);
    this.executeLotteryPool(launchId, 'weighted_lottery');
    this.executeLotteryPool(launchId, 'public_lottery');
    this.executeLotteryPool(launchId, 'flipper');
    this.executeFCFSPool(launchId);

    const launch = this.launches.get(launchId);
    if (launch) {
      launch.participantCount = Object.values(launch.pools)
        .reduce((sum, p) => sum + p.participants.filter(x => x.status === 'filled' || x.status === 'won').length, 0);
    }
  }

  /**
   * Get launch allocation status
   */
  getLaunchStatus(launchId: string): LaunchAllocation | undefined {
    return this.launches.get(launchId);
  }

  /**
   * Get user's allocation across all pools
   */
  getUserAllocation(launchId: string, wallet: string): {
    totalTokens: number;
    totalValueUSD: number;
    allocations: AllocationEntry[];
  } {
    const launch = this.launches.get(launchId);
    if (!launch) {
      return { totalTokens: 0, totalValueUSD: 0, allocations: [] };
    }

    const allocations: AllocationEntry[] = [];
    let totalTokens = 0;
    let totalValueUSD = 0;

    for (const pool of Object.values(launch.pools)) {
      const entry = pool.participants.find(p => p.wallet === wallet);
      if (entry && (entry.status === 'filled' || entry.status === 'won')) {
        allocations.push(entry);
        totalTokens += entry.allocatedTokens;
        totalValueUSD += entry.allocatedValueUSD;
      }
    }

    return { totalTokens, totalValueUSD, allocations };
  }

  /**
   * Open a specific pool for requests
   */
  openPool(launchId: string, pool: AllocationPool): void {
    const launch = this.launches.get(launchId);
    if (launch) {
      launch.pools[pool].status = 'open';
    }
  }

  /**
   * Close a specific pool
   */
  closePool(launchId: string, pool: AllocationPool): void {
    const launch = this.launches.get(launchId);
    if (launch) {
      launch.pools[pool].status = 'closed';
    }
  }
}

export const allocationManager = new AllocationManager();
