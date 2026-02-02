/**
 * DiamondPad Test Suite
 * 
 * Tests for diamond rewards calculator and bundle detection
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { DiamondRewardsCalculator } from '../src/rewards/diamond';
import { BundleDetector } from '../src/detector/bundle';
import { DIAMOND_CONFIG } from '../src/types';

describe('DiamondRewardsCalculator', () => {
  const calculator = new DiamondRewardsCalculator();

  describe('getDiamondRank', () => {
    it('should return Paper for < 7 days', () => {
      expect(calculator.getDiamondRank(0)).toBe('Paper');
      expect(calculator.getDiamondRank(1)).toBe('Paper');
      expect(calculator.getDiamondRank(6)).toBe('Paper');
    });

    it('should return Bronze for 7-29 days', () => {
      expect(calculator.getDiamondRank(7)).toBe('Bronze');
      expect(calculator.getDiamondRank(15)).toBe('Bronze');
      expect(calculator.getDiamondRank(29)).toBe('Bronze');
    });

    it('should return Silver for 30-59 days', () => {
      expect(calculator.getDiamondRank(30)).toBe('Silver');
      expect(calculator.getDiamondRank(45)).toBe('Silver');
      expect(calculator.getDiamondRank(59)).toBe('Silver');
    });

    it('should return Gold for 60-89 days', () => {
      expect(calculator.getDiamondRank(60)).toBe('Gold');
      expect(calculator.getDiamondRank(75)).toBe('Gold');
      expect(calculator.getDiamondRank(89)).toBe('Gold');
    });

    it('should return Platinum for 90-179 days', () => {
      expect(calculator.getDiamondRank(90)).toBe('Platinum');
      expect(calculator.getDiamondRank(120)).toBe('Platinum');
      expect(calculator.getDiamondRank(179)).toBe('Platinum');
    });

    it('should return Diamond for 180+ days', () => {
      expect(calculator.getDiamondRank(180)).toBe('Diamond');
      expect(calculator.getDiamondRank(365)).toBe('Diamond');
      expect(calculator.getDiamondRank(1000)).toBe('Diamond');
    });
  });

  describe('getMultiplier', () => {
    it('should return correct multipliers', () => {
      expect(calculator.getMultiplier(0)).toBe(1.0);   // Paper
      expect(calculator.getMultiplier(7)).toBe(1.5);   // Bronze
      expect(calculator.getMultiplier(30)).toBe(2.0);  // Silver
      expect(calculator.getMultiplier(60)).toBe(2.5);  // Gold
      expect(calculator.getMultiplier(90)).toBe(3.0);  // Platinum
      expect(calculator.getMultiplier(180)).toBe(3.5); // Diamond
    });

    it('should return max multiplier for very long holds', () => {
      expect(calculator.getMultiplier(365)).toBe(3.5);
      expect(calculator.getMultiplier(730)).toBe(3.5);
    });
  });

  describe('projectRewards', () => {
    it('should return projections for milestones', () => {
      const projections = calculator.projectRewards(1_000_000, 0, 365);
      
      expect(projections.length).toBeGreaterThan(0);
      expect(projections[0].day).toBe(7);
      
      // Later milestones should have higher multipliers
      const day7 = projections.find(p => p.day === 7);
      const day180 = projections.find(p => p.day === 180);
      
      expect(day7?.multiplier).toBeLessThan(day180?.multiplier || 0);
    });

    it('should show increasing rewards over time', () => {
      const projections = calculator.projectRewards(1_000_000, 0, 365);
      
      for (let i = 1; i < projections.length; i++) {
        expect(projections[i].estimatedRewards).toBeGreaterThan(
          projections[i - 1].estimatedRewards
        );
      }
    });
  });

  describe('calculateGlobalScore', () => {
    it('should return 0 for empty history', () => {
      const score = calculator.calculateGlobalScore([]);
      expect(score).toBe(0);
    });

    it('should reward long holds', () => {
      const shortHold = calculator.calculateGlobalScore([
        { launchId: '1', holdDays: 5, profitLoss: 0, wasRugged: false, heldThroughDip: false }
      ]);
      
      const longHold = calculator.calculateGlobalScore([
        { launchId: '1', holdDays: 180, profitLoss: 0, wasRugged: false, heldThroughDip: false }
      ]);
      
      expect(longHold).toBeGreaterThan(shortHold);
    });

    it('should reward holding through dips', () => {
      const noDip = calculator.calculateGlobalScore([
        { launchId: '1', holdDays: 30, profitLoss: 0, wasRugged: false, heldThroughDip: false }
      ]);
      
      const heldDip = calculator.calculateGlobalScore([
        { launchId: '1', holdDays: 30, profitLoss: 0, wasRugged: false, heldThroughDip: true }
      ]);
      
      expect(heldDip).toBeGreaterThan(noDip);
    });

    it('should penalize quick flips', () => {
      const quickFlip = calculator.calculateGlobalScore([
        { launchId: '1', holdDays: 0, profitLoss: 100, wasRugged: false, heldThroughDip: false }
      ]);
      
      // Quick flip with profit should have penalty
      expect(quickFlip).toBeLessThanOrEqual(0);
    });
  });

  describe('calculateAirdropEligibility', () => {
    it('should reject users with no history', () => {
      const result = calculator.calculateAirdropEligibility('wallet1', 0, 0, 0);
      expect(result.eligible).toBe(false);
    });

    it('should accept users with good history', () => {
      const result = calculator.calculateAirdropEligibility('wallet1', 10, 5, 45);
      expect(result.eligible).toBe(true);
      expect(result.tier).not.toBe('none');
    });

    it('should give higher tiers for higher scores', () => {
      const low = calculator.calculateAirdropEligibility('wallet1', 3, 2, 14);
      const high = calculator.calculateAirdropEligibility('wallet1', 25, 10, 90);
      
      expect(high.allocationMultiplier).toBeGreaterThan(low.allocationMultiplier);
    });
  });
});

describe('DIAMOND_CONFIG', () => {
  it('should have valid multiplier progression', () => {
    const multipliers = DIAMOND_CONFIG.MULTIPLIERS;
    
    expect(multipliers.PAPER.multiplier).toBeLessThan(multipliers.BRONZE.multiplier);
    expect(multipliers.BRONZE.multiplier).toBeLessThan(multipliers.SILVER.multiplier);
    expect(multipliers.SILVER.multiplier).toBeLessThan(multipliers.GOLD.multiplier);
    expect(multipliers.GOLD.multiplier).toBeLessThan(multipliers.PLATINUM.multiplier);
    expect(multipliers.PLATINUM.multiplier).toBeLessThan(multipliers.DIAMOND.multiplier);
  });

  it('should have reasonable safety limits', () => {
    expect(DIAMOND_CONFIG.MAX_DEV_ALLOCATION).toBeLessThanOrEqual(10);
    expect(DIAMOND_CONFIG.MIN_DEV_VESTING_MONTHS).toBeGreaterThanOrEqual(6);
    expect(DIAMOND_CONFIG.MIN_LIQUIDITY_LOCK_MONTHS).toBeGreaterThanOrEqual(12);
  });
});
