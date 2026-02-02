/**
 * Staking Tiers System
 * 
 * The core of DiamondPad's holder-first approach.
 * Higher stakes + longer locks = better allocation access.
 * 
 * Tiers:
 * 💎 Diamond - 100k+ tokens, 180 day lock, 10x weight
 * 🥇 Gold    - 50k tokens, 90 day lock, 5x weight
 * 🥈 Silver  - 20k tokens, 60 day lock, 2.5x weight
 * 🥉 Bronze  - 5k tokens, 30 day lock, 1x weight
 * 📄 Public  - No stake required, 0.25x weight
 */

import { PublicKey } from '@solana/web3.js';

// ============ Types ============

export type StakingTier = 'diamond' | 'gold' | 'silver' | 'bronze' | 'public';

export interface TierConfig {
  name: string;
  emoji: string;
  minStake: number;           // Minimum $LAUNCH tokens
  lockDays: number;           // Minimum lock period
  allocationWeight: number;   // Multiplier for allocation calculations
  guaranteedAllocation: boolean;
  lotteryBoost: number;       // Multiplier for lottery odds
  feeDiscount: number;        // % discount on platform fees
  priorityAccess: boolean;    // Early access to launches
  maxAllocationPercent: number; // Max % of a launch they can get
}

export interface StakerPosition {
  wallet: string;
  stakedAmount: number;
  stakedAt: Date;
  lockEndDate: Date;
  tier: StakingTier;
  strongHolderScore: number;  // SHS from hold history
  effectiveWeight: number;    // tier weight * SHS multiplier
  totalAllocationsReceived: number;
  totalAllocationsValue: number;
  loyaltyStreak: number;      // Consecutive launches held without dumping
}

export interface StakeRequest {
  wallet: string;
  amount: number;
  lockDays: number;
}

export interface UnstakeRequest {
  wallet: string;
  amount: number;
  early: boolean;  // Before lock period ends
}

// ============ Configuration ============

export const TIER_CONFIG: Record<StakingTier, TierConfig> = {
  diamond: {
    name: 'Diamond',
    emoji: '💎',
    minStake: 100_000,
    lockDays: 180,
    allocationWeight: 10,
    guaranteedAllocation: true,
    lotteryBoost: 5.0,
    feeDiscount: 0.6,        // 60% fee discount
    priorityAccess: true,
    maxAllocationPercent: 5,  // Max 5% per wallet
  },
  gold: {
    name: 'Gold',
    emoji: '🥇',
    minStake: 50_000,
    lockDays: 90,
    allocationWeight: 5,
    guaranteedAllocation: true,
    lotteryBoost: 3.0,
    feeDiscount: 0.4,
    priorityAccess: true,
    maxAllocationPercent: 3,
  },
  silver: {
    name: 'Silver',
    emoji: '🥈',
    minStake: 20_000,
    lockDays: 60,
    allocationWeight: 2.5,
    guaranteedAllocation: false,
    lotteryBoost: 2.0,
    feeDiscount: 0.25,
    priorityAccess: false,
    maxAllocationPercent: 2,
  },
  bronze: {
    name: 'Bronze',
    emoji: '🥉',
    minStake: 5_000,
    lockDays: 30,
    allocationWeight: 1,
    guaranteedAllocation: false,
    lotteryBoost: 1.5,
    feeDiscount: 0.1,
    priorityAccess: false,
    maxAllocationPercent: 1,
  },
  public: {
    name: 'Public',
    emoji: '📄',
    minStake: 0,
    lockDays: 0,
    allocationWeight: 0.25,
    guaranteedAllocation: false,
    lotteryBoost: 1.0,
    feeDiscount: 0,
    priorityAccess: false,
    maxAllocationPercent: 0.5,
  },
};

// Early unstake penalty
export const EARLY_UNSTAKE_PENALTY = 0.1; // 10% penalty

// SHS multiplier range
export const SHS_MIN_MULTIPLIER = 0.5;
export const SHS_MAX_MULTIPLIER = 2.0;

// ============ Staking Tier Manager ============

export class StakingTierManager {
  private stakers: Map<string, StakerPosition> = new Map();
  
  /**
   * Determine tier based on stake amount and lock period
   */
  getTierForStake(amount: number, lockDays: number): StakingTier {
    // Check tiers in order of highest to lowest
    if (amount >= TIER_CONFIG.diamond.minStake && lockDays >= TIER_CONFIG.diamond.lockDays) {
      return 'diamond';
    }
    if (amount >= TIER_CONFIG.gold.minStake && lockDays >= TIER_CONFIG.gold.lockDays) {
      return 'gold';
    }
    if (amount >= TIER_CONFIG.silver.minStake && lockDays >= TIER_CONFIG.silver.lockDays) {
      return 'silver';
    }
    if (amount >= TIER_CONFIG.bronze.minStake && lockDays >= TIER_CONFIG.bronze.lockDays) {
      return 'bronze';
    }
    return 'public';
  }

  /**
   * Calculate Strong Holder Score (SHS)
   * Combines holding history, loyalty, and on-chain activity
   */
  calculateSHS(history: {
    holdDuration: number;      // Average days held across launches
    launchesParticipated: number;
    launchesHeldLong: number;  // Held 30+ days
    quickFlips: number;        // Sold within 24h
    lpProvided: boolean;
    governanceVotes: number;
  }): number {
    let score = 50; // Base score
    
    // Hold duration factor (40%)
    const holdFactor = Math.min(history.holdDuration / 90, 1) * 40;
    score += holdFactor;
    
    // Loyalty coefficient (20%)
    const loyaltyRatio = history.launchesHeldLong / Math.max(history.launchesParticipated, 1);
    score += loyaltyRatio * 20;
    
    // Flip penalty
    const flipRatio = history.quickFlips / Math.max(history.launchesParticipated, 1);
    score -= flipRatio * 30;
    
    // On-chain activity bonus (15%)
    if (history.lpProvided) score += 10;
    score += Math.min(history.governanceVotes, 5); // Max 5 points from voting
    
    // Normalize to 0-100
    score = Math.max(0, Math.min(100, score));
    
    return score;
  }

  /**
   * Convert SHS to multiplier
   * SHS 0-100 maps to 0.5x-2.0x
   */
  shsToMultiplier(shs: number): number {
    const normalized = shs / 100;
    return SHS_MIN_MULTIPLIER + (normalized * (SHS_MAX_MULTIPLIER - SHS_MIN_MULTIPLIER));
  }

  /**
   * Calculate effective allocation weight
   * tierWeight * shsMultiplier
   */
  getEffectiveWeight(tier: StakingTier, shs: number): number {
    const tierConfig = TIER_CONFIG[tier];
    const shsMultiplier = this.shsToMultiplier(shs);
    return tierConfig.allocationWeight * shsMultiplier;
  }

  /**
   * Stake tokens
   */
  async stake(request: StakeRequest): Promise<StakerPosition> {
    const tier = this.getTierForStake(request.amount, request.lockDays);
    const tierConfig = TIER_CONFIG[tier];
    
    // Get existing position or create new
    let position = this.stakers.get(request.wallet);
    
    if (position) {
      // Add to existing stake
      position.stakedAmount += request.amount;
      position.lockEndDate = new Date(
        Math.max(
          position.lockEndDate.getTime(),
          Date.now() + request.lockDays * 24 * 60 * 60 * 1000
        )
      );
      position.tier = this.getTierForStake(position.stakedAmount, request.lockDays);
    } else {
      // New staker
      const shs = 50; // Default SHS for new stakers
      position = {
        wallet: request.wallet,
        stakedAmount: request.amount,
        stakedAt: new Date(),
        lockEndDate: new Date(Date.now() + request.lockDays * 24 * 60 * 60 * 1000),
        tier,
        strongHolderScore: shs,
        effectiveWeight: this.getEffectiveWeight(tier, shs),
        totalAllocationsReceived: 0,
        totalAllocationsValue: 0,
        loyaltyStreak: 0,
      };
    }
    
    // Update effective weight
    position.effectiveWeight = this.getEffectiveWeight(position.tier, position.strongHolderScore);
    
    this.stakers.set(request.wallet, position);
    return position;
  }

  /**
   * Unstake tokens
   */
  async unstake(request: UnstakeRequest): Promise<{
    amountReturned: number;
    penaltyApplied: number;
    newPosition: StakerPosition | null;
  }> {
    const position = this.stakers.get(request.wallet);
    
    if (!position) {
      throw new Error('No staking position found');
    }
    
    if (request.amount > position.stakedAmount) {
      throw new Error('Insufficient staked balance');
    }
    
    let penalty = 0;
    let amountReturned = request.amount;
    
    // Apply early unstake penalty
    if (request.early && position.lockEndDate > new Date()) {
      penalty = request.amount * EARLY_UNSTAKE_PENALTY;
      amountReturned = request.amount - penalty;
    }
    
    // Update or remove position
    position.stakedAmount -= request.amount;
    
    if (position.stakedAmount <= 0) {
      this.stakers.delete(request.wallet);
      return {
        amountReturned,
        penaltyApplied: penalty,
        newPosition: null,
      };
    }
    
    // Recalculate tier
    const remainingLockDays = Math.max(
      0,
      Math.floor((position.lockEndDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    );
    position.tier = this.getTierForStake(position.stakedAmount, remainingLockDays);
    position.effectiveWeight = this.getEffectiveWeight(position.tier, position.strongHolderScore);
    
    this.stakers.set(request.wallet, position);
    
    return {
      amountReturned,
      penaltyApplied: penalty,
      newPosition: position,
    };
  }

  /**
   * Get staker position
   */
  getPosition(wallet: string): StakerPosition | undefined {
    return this.stakers.get(wallet);
  }

  /**
   * Get all stakers by tier
   */
  getStakersByTier(tier: StakingTier): StakerPosition[] {
    return Array.from(this.stakers.values()).filter(s => s.tier === tier);
  }

  /**
   * Get tier statistics
   */
  getTierStats(): {
    tier: StakingTier;
    count: number;
    totalStaked: number;
    avgSHS: number;
  }[] {
    const tiers: StakingTier[] = ['diamond', 'gold', 'silver', 'bronze', 'public'];
    
    return tiers.map(tier => {
      const stakers = this.getStakersByTier(tier);
      return {
        tier,
        count: stakers.length,
        totalStaked: stakers.reduce((sum, s) => sum + s.stakedAmount, 0),
        avgSHS: stakers.length > 0
          ? stakers.reduce((sum, s) => sum + s.strongHolderScore, 0) / stakers.length
          : 0,
      };
    });
  }

  /**
   * Update SHS for a staker (called after launch completion)
   */
  updateSHS(wallet: string, newSHS: number): void {
    const position = this.stakers.get(wallet);
    if (position) {
      position.strongHolderScore = newSHS;
      position.effectiveWeight = this.getEffectiveWeight(position.tier, newSHS);
      this.stakers.set(wallet, position);
    }
  }

  /**
   * Check if wallet qualifies for guaranteed allocation
   */
  hasGuaranteedAllocation(wallet: string): boolean {
    const position = this.stakers.get(wallet);
    if (!position) return false;
    return TIER_CONFIG[position.tier].guaranteedAllocation;
  }

  /**
   * Get lottery boost for wallet
   */
  getLotteryBoost(wallet: string): number {
    const position = this.stakers.get(wallet);
    if (!position) return TIER_CONFIG.public.lotteryBoost;
    return TIER_CONFIG[position.tier].lotteryBoost * this.shsToMultiplier(position.strongHolderScore);
  }
}

export const stakingManager = new StakingTierManager();
