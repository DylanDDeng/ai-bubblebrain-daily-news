---
title: "mHC: Manifold-Constrained Hyper-Connections"
date: 2026-01-01T10:00:00+08:00
description: "DeepSeek introduces the mHC module for stable hyper connections."
tags: ["Model", "DeepSeek"]
---

This paper from DeepSeek proposes mHC, a constrained formulation of hyper connections for large language model training. The core idea is to constrain the residual mixing matrix so that signal propagation remains stable in deep networks.

### Motivation

Residual connections rely on an identity mapping property that enables stable signal and gradient flow. Prior hyper connection designs expand the residual stream and increase connectivity, but the unconstrained mixing can amplify or attenuate activations across layers. This often leads to training instability and higher memory and communication costs at scale.

### Method

mHC constrains the residual mixing matrix by projecting it onto the manifold of doubly stochastic matrices, also known as the Birkhoff polytope. The projection is implemented with iterative Sinkhorn Knopp normalization so that every row and every column sums to one.

This constraint turns residual mixing into a convex combination of features. It preserves the mean of the residual stream and bounds the spectral norm of the mixing, reducing gradient explosion and vanishing in deep models.

### System optimizations

The paper also introduces system level optimizations to reduce overhead from wider residual streams.

* Fused mixed precision kernels implemented with TileLang to reduce memory traffic
* Selective activation recomputation to lower peak memory use
* An extended DualPipe schedule to overlap additional communication with computation

At a 27B model scale, the reported overhead is about 6.7% wall time.

### Results

The authors report improved training stability, including smoother loss curves and gradient norms, and gains on downstream evaluations such as BBH, DROP, and MATH. Scaling studies from 3B to 27B suggest the approach remains stable at larger sizes.
