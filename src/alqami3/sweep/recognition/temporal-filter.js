// 5-Frame Sliding-Window Temporal Voting & EMA Filter for 360° Multi-Angle Artifact Recognition

export class TemporalStabilityFilter {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 5;
    this.requiredVotes = options.requiredVotes || 3;
    this.lossGraceMs = options.lossGraceMs || 1200;
    this.emaAlpha = options.emaAlpha || 0.45;

    this.window = []; // Array of { id, candidate, score, timestamp }
    this.lastConfirmedCandidate = null;
    this.lastConfirmedTimestamp = 0;
    this.emaScores = new Map(); // id -> smoothed score
  }

  /**
   * Process a new detection observation using a 5-frame sliding-window vote
   * @param {Object|null} currentBestCandidate - { id, title, similarity, matchedView } or null if unknown
   * @param {number} timestamp - current timestamp
   * @returns {Object} { status: 'CONFIRMED' | 'CANDIDATE' | 'UNKNOWN', candidate, stabilityScore }
   */
  process(currentBestCandidate, timestamp = performance.now()) {
    const entryId = currentBestCandidate ? currentBestCandidate.id : null;
    const rawScore = currentBestCandidate ? (currentBestCandidate.similarity || 0) : 0;

    // Update EMA for observed candidate
    if (entryId) {
      const prev = this.emaScores.get(entryId) ?? rawScore;
      this.emaScores.set(entryId, this.emaAlpha * rawScore + (1 - this.emaAlpha) * prev);
    }

    // Push into sliding window
    this.window.push({
      id: entryId,
      candidate: currentBestCandidate,
      score: rawScore,
      timestamp
    });
    if (this.window.length > this.windowSize) {
      this.window.shift();
    }

    // Tally votes per artifact ID in the window
    const voteCounts = new Map();
    const latestCandidateById = new Map();
    for (const item of this.window) {
      if (!item.id) continue;
      voteCounts.set(item.id, (voteCounts.get(item.id) || 0) + 1);
      latestCandidateById.set(item.id, item.candidate);
    }

    // Find winner in sliding window
    let bestId = null;
    let bestVotes = 0;
    for (const [id, count] of voteCounts.entries()) {
      if (count > bestVotes) {
        bestVotes = count;
        bestId = id;
      }
    }

    if (bestId && bestVotes >= this.requiredVotes) {
      const winner = latestCandidateById.get(bestId);
      const smoothed = this.emaScores.get(bestId) ?? winner.similarity;
      const outCandidate = {
        ...winner,
        similarity: Math.max(winner.similarity, smoothed * 0.99)
      };
      this.lastConfirmedCandidate = outCandidate;
      this.lastConfirmedTimestamp = timestamp;
      return {
        status: 'CONFIRMED',
        candidate: outCandidate,
        stabilityScore: bestVotes / this.windowSize
      };
    }

    // Grace period if we were recently confirmed and user is orbiting across a brief blind spot
    const elapsedSinceConfirm = timestamp - this.lastConfirmedTimestamp;
    if (this.lastConfirmedCandidate && elapsedSinceConfirm < this.lossGraceMs) {
      // Only hold grace if the window isn't overwhelmingly empty (e.g. >= 4 nulls)
      const nullCount = this.window.filter(w => w.id === null).length;
      if (nullCount < 4) {
        return {
          status: 'CONFIRMED',
          candidate: this.lastConfirmedCandidate,
          stabilityScore: Math.max(0.2, 1 - elapsedSinceConfirm / this.lossGraceMs)
        };
      }
    }

    if (bestId && bestVotes >= 1) {
      return {
        status: 'CANDIDATE',
        candidate: latestCandidateById.get(bestId),
        stabilityScore: bestVotes / this.requiredVotes
      };
    }

    this.lastConfirmedCandidate = null;
    return {
      status: 'UNKNOWN',
      candidate: null,
      stabilityScore: 0
    };
  }

  reset() {
    this.window = [];
    this.lastConfirmedCandidate = null;
    this.lastConfirmedTimestamp = 0;
    this.emaScores.clear();
  }
}
