// Multi-Scale Foreground-Masked 3D Statue Similarity Metrics for Alqami Artifact Recognition
// Combines 1280-D MobileNetV2 WebGL Embeddings (Masked, Tight, Medium, Fused) + 64-D 3-Zone Part Signature

export class SimilarityMetrics {
  static dotProduct(a, b) {
    let sum = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  static magnitude(a) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * a[i];
    }
    return Math.sqrt(sum);
  }

  static cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
    const dot = this.dotProduct(vecA, vecB);
    const magA = this.magnitude(vecA);
    const magB = this.magnitude(vecB);
    if (magA === 0 || magB === 0) return 0;
    const sim = dot / (magA * magB);
    return Math.max(0, Math.min(1, sim));
  }

  /**
   * Compares a 4-window multi-scale + foreground-masked query embedding against the multi-view
   * artifact database and optional _NEGATIVE_BACKGROUND distractor vectors.
   */
  static evaluate(queryEmbedding, artifacts) {
    if (!queryEmbedding || !artifacts || artifacts.length === 0) {
      return {
        bestMatch: null,
        candidates: [],
        topScore: 0,
        runnerUpScore: 0,
        negativeScore: 0,
        margin: 0
      };
    }

    const qMasked = queryEmbedding.maskedVector || null;
    const qTight = queryEmbedding.tightVector || null;
    const qMed = queryEmbedding.mediumVector || null;
    const qColor = queryEmbedding.colorSignature || null;

    let negativeScore = 0;
    const candidateScores = [];

    for (const artifact of artifacts) {
      if (!artifact.embeddings || artifact.embeddings.length === 0) continue;

      // Track negative/background distractor similarity separately
      if (artifact.id === '_NEGATIVE_BACKGROUND' || artifact.type === 'negative') {
        for (const ref of artifact.embeddings) {
          if (!ref.vector || ref.vector.length !== queryEmbedding.length) continue;
          const simFused = this.cosineSimilarity(queryEmbedding, ref.vector);
          const simMed = qMed ? this.cosineSimilarity(qMed, ref.vector) : 0;
          const s = Math.max(simFused, simMed);
          if (s > negativeScore) negativeScore = s;
        }
        continue;
      }

      const viewScores = [];
      const angleMap = {};

      for (const ref of artifact.embeddings) {
        if (!ref.vector || ref.vector.length !== queryEmbedding.length) continue;

        let cnnSim = this.cosineSimilarity(queryEmbedding, ref.vector);

        if (qMasked) {
          const simMasked = this.cosineSimilarity(qMasked, ref.vector);
          // When both query and reference are elliptically foreground-masked, reward background-free structural match
          const maskedBoost = (ref.scale && ref.scale.includes('masked')) ? 0.015 : 0;
          if (simMasked + maskedBoost > cnnSim) {
            cnnSim = Math.min(0.995, simMasked + maskedBoost);
          }
        }

        if (qTight) {
          const simTight = this.cosineSimilarity(qTight, ref.vector);
          if (simTight > cnnSim) cnnSim = simTight;
        }

        if (qMed) {
          const simMed = this.cosineSimilarity(qMed, ref.vector);
          if (simMed > cnnSim) cnnSim = simMed;
        }

        // Hybrid 3D Part-Structure & Material Signature Fusion (82% CNN + 18% 3-Zone Part Signature)
        let combinedSim = cnnSim;
        if (qColor && ref.colorSignature && ref.colorSignature.length === qColor.length) {
          const colorSim = this.cosineSimilarity(qColor, ref.colorSignature);
          combinedSim = cnnSim * 0.82 + colorSim * 0.18;
        }

        const viewKey = ref.view || 'front';
        viewScores.push({
          score: combinedSim,
          cnnScore: cnnSim,
          view: viewKey,
          scale: ref.scale || 'default',
          label: ref.label || viewKey
        });

        if (!angleMap[viewKey] || combinedSim > angleMap[viewKey]) {
          angleMap[viewKey] = combinedSim;
        }
      }

      if (viewScores.length === 0) continue;

      viewScores.sort((a, b) => b.score - a.score);
      const bestViewObj = viewScores[0];
      let finalScore = bestViewObj.score;

      // Multi-Angle 3D Consensus Boost
      const distinctAngles = Object.values(angleMap).sort((a, b) => b - a);
      if (distinctAngles.length >= 2 && distinctAngles[1] >= 0.54) {
        const consensus = distinctAngles[0] * 0.84 + distinctAngles[1] * 0.16 + 0.025;
        finalScore = Math.min(0.995, Math.max(finalScore, consensus));
      } else if (viewScores.length >= 2 && viewScores[1].score >= 0.56) {
        const scaleConsensus = viewScores[0].score * 0.86 + viewScores[1].score * 0.14 + 0.015;
        finalScore = Math.min(0.995, Math.max(finalScore, scaleConsensus));
      }

      candidateScores.push({
        artifact: artifact,
        id: artifact.id,
        title: artifact.title,
        similarity: finalScore,
        rawBestSimilarity: bestViewObj.score,
        matchedView: bestViewObj.view,
        matchedLabel: bestViewObj.label,
        angleBreakdown: angleMap
      });
    }

    candidateScores.sort((a, b) => b.similarity - a.similarity);

    const bestMatch = candidateScores.length > 0 ? candidateScores[0] : null;
    const secondMatch = candidateScores.length > 1 ? candidateScores[1] : null;
    const topScore = bestMatch ? bestMatch.similarity : 0;
    const runnerUpScore = secondMatch ? secondMatch.similarity : 0;
    const margin = Math.max(0, topScore - runnerUpScore);

    if (bestMatch) {
      bestMatch.margin = margin;
      bestMatch.negativeScore = negativeScore;
    }

    return {
      bestMatch,
      candidates: candidateScores.slice(0, 6),
      topScore,
      runnerUpScore,
      negativeScore,
      margin
    };
  }
}
