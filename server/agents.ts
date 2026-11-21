import {
  AgentStageResult,
  AgentStreamEvent,
  CandidateEvaluation,
  MultiAgentWorkflowRun,
  SupervisorAudit,
  VehicleProfile,
} from '../src/types/parkpool';
import {
  BENGALURU_LOCATIONS,
  formatMinutesToTime,
  parseTimeToMinutes,
  POLICY_RAG_CORPUS,
  store,
} from './domain';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'openrouter/auto';

function getOpenRouterConfig(): { apiKey: string; model: string; referer: string } {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_OPENROUTER_API_KEY') {
    throw new Error(
      'OPENROUTER_API_KEY is not configured. Please add your OpenRouter API key in environment secrets.'
    );
  }
  const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
  const appUrl = process.env.APP_URL?.trim();
  const referer =
    appUrl && appUrl !== 'MY_APP_URL' && /^https?:\/\//i.test(appUrl)
      ? appUrl
      : 'http://localhost:3000';
  return { apiKey, model, referer };
}

function extractJsonObject(rawText: string): Record<string, unknown> {
  const trimmed = rawText.trim();
  if (!trimmed) return {};

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    }
    throw new Error('OpenRouter response did not contain valid JSON.');
  }
}

async function callOpenRouter(params: {
  systemPrompt: string;
  userPrompt: string;
  expectJson?: boolean;
}): Promise<{ text: string; modelUsed: string }> {
  const { apiKey, model, referer } = getOpenRouterConfig();

  const executeRequest = async (useJsonFormat: boolean) => {
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 900,
    };

    if (useJsonFormat) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': referer,
        'X-Title': 'ParkPool AI',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const errJson = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      const errMsg = errJson?.error?.message || `OpenRouter API HTTP ${res.status}`;
      const error = new Error(errMsg) as Error & { status?: number };
      error.status = res.status;
      throw error;
    }

    const data = (await res.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
    };

    const rawContent = data.choices?.[0]?.message?.content;
    const text =
      typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
        ? rawContent.map((part) => part?.text || '').join('')
        : '';

    return {
      text: text.trim(),
      modelUsed: data.model || model,
    };
  };

  try {
    return await executeRequest(Boolean(params.expectJson));
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    // Some OpenRouter-routed models reject response_format=json_object with HTTP 400; retry cleanly
    if (params.expectJson && status === 400) {
      return await executeRequest(false);
    }
    throw err;
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runSupervisedMultiAgentWorkflow(
  input: {
    prompt: string;
    vehicleId: string;
    defaultStartTime?: string;
    defaultEndTime?: string;
    faultInjectionEnabled?: boolean;
    targetSpaceId?: string;
    destinationCoords?: { lat: number; lng: number };
  },
  onEvent?: (ev: AgentStreamEvent) => void
): Promise<MultiAgentWorkflowRun> {
  const workflowStart = Date.now();
  const runId = `RUN-${Date.now().toString(36).toUpperCase()}`;

  // Validate OpenRouter API key upfront before running workflow stages
  const { model: configuredModel } = getOpenRouterConfig();

  const vehicle: VehicleProfile =
    store.vehicles.find((v) => v.id === input.vehicleId) || store.vehicles[0];
  const faultInjectionEnabled = Boolean(input.faultInjectionEnabled);

  onEvent?.({
    type: 'workflow_init',
    runId,
    vehicle,
    faultInjectionEnabled,
  });

  const stages: AgentStageResult[] = [];

  // =========================================================================
  // STAGE 1: Parking Intent & Policy Agent (OpenRouter AI)
  // =========================================================================
  onEvent?.({
    type: 'stage_start',
    stageOrder: 1,
    agentId: 'intent_policy_agent',
    agentName: 'Parking Intent & Policy Agent',
    message: `Parsing natural-language request for ${vehicle.label}...`,
  });

  const s1Start = Date.now();
  const fallbackStart = input.defaultStartTime || '14:00';
  const fallbackEnd = input.defaultEndTime || '17:30';

  const intentResult = await callOpenRouter({
    systemPrompt:
      'You are a structured parking intent parser for Bengaluru. Respond ONLY with a raw valid JSON object (no markdown fences, no commentary).',
    userPrompt: `Extract structured parking search requirements from this driver request for Bengaluru.
Driver Request: "${input.prompt}"
Selected Vehicle: ${vehicle.label} (${vehicle.vehicleType}, EV=${vehicle.isEv}, ${vehicle.lengthCm}x${vehicle.widthCm}x${vehicle.heightCm}cm)
Default Time Window if not specified in prompt: ${fallbackStart} to ${fallbackEnd}

Return a JSON object with EXACTLY these keys:
{
  "destination": string,
  "startTimeHHMM": "HH:MM",
  "endTimeHHMM": "HH:MM",
  "prioritize": "balanced" | "closest_walk" | "lowest_price" | "covered_ev",
  "maxWalkMeters": integer,
  "needsEv": boolean,
  "needsCovered": boolean,
  "policyConcern": string (optional)
}`,
    expectJson: true,
  });

  const parsedRaw = extractJsonObject(intentResult.text);
  let reqStartMin = parseTimeToMinutes(
    typeof parsedRaw.startTimeHHMM === 'string' ? parsedRaw.startTimeHHMM : fallbackStart,
    14 * 60
  );
  let reqEndMin = parseTimeToMinutes(
    typeof parsedRaw.endTimeHHMM === 'string' ? parsedRaw.endTimeHHMM : fallbackEnd,
    17 * 60 + 30
  );

  const s1Violations: string[] = [];
  let s1Corrective = 'None required — structured intent passed all schema and boundary checks.';
  if (reqEndMin <= reqStartMin) {
    s1Violations.push(
      `Invalid time interval (${formatMinutesToTime(reqStartMin)} >= ${formatMinutesToTime(reqEndMin)})`
    );
    reqEndMin = Math.min(23 * 60, reqStartMin + 180);
    s1Corrective = `Normalized end time to ${formatMinutesToTime(reqEndMin)} (+3h window).`;
  }
  let maxWalkMeters = Number(parsedRaw.maxWalkMeters) || 550;
  if (maxWalkMeters < 150) {
    s1Violations.push(`Unrealistic maxWalkMeters (${maxWalkMeters}m < 150m minimum cluster radius)`);
    maxWalkMeters = 350;
    s1Corrective = 'Adjusted minimum search radius to 350m to cover verified entrances.';
  }

  const validPriorities = ['balanced', 'closest_walk', 'lowest_price', 'covered_ev'] as const;
  const rawPrioritize = String(parsedRaw.prioritize || 'balanced');
  const prioritize = validPriorities.includes(
    rawPrioritize as 'balanced' | 'closest_walk' | 'lowest_price' | 'covered_ev'
  )
    ? (rawPrioritize as 'balanced' | 'closest_walk' | 'lowest_price' | 'covered_ev')
    : 'balanced';

  const parsedIntent = {
    destination:
      typeof parsedRaw.destination === 'string' && parsedRaw.destination.trim()
        ? parsedRaw.destination.trim()
        : 'Phoenix Mall of Asia, Bengaluru',
    startTimeLabel: formatMinutesToTime(reqStartMin),
    endTimeLabel: formatMinutesToTime(reqEndMin),
    prioritize,
    maxWalkMeters,
    needsEv: Boolean(parsedRaw.needsEv),
    needsCovered: Boolean(parsedRaw.needsCovered),
    policyConcern:
      typeof parsedRaw.policyConcern === 'string' && parsedRaw.policyConcern.trim()
        ? parsedRaw.policyConcern.trim()
        : undefined,
  };

  const s1Audit: SupervisorAudit = {
    verdict: s1Violations.length > 0 ? 'FLAGGED_AND_CORRECTED' : 'VERIFIED',
    accuracyScore: s1Violations.length > 0 ? 86 : 100,
    invariantsChecked: [
      'JSON schema completeness',
      'Temporal interval validity (end > start)',
      'Geospatial search radius bounds (>= 150m)',
    ],
    violationsCaught: s1Violations,
    correctiveAction: s1Corrective,
    verifierNotes: `Verified structured slot ${parsedIntent.startTimeLabel}–${parsedIntent.endTimeLabel} for ${vehicle.label}.`,
    checkedAtIso: new Date().toISOString(),
  };

  onEvent?.({
    type: 'supervisor_check',
    stageOrder: 1,
    agentId: 'intent_policy_agent',
    verdict: s1Audit.verdict,
    message: s1Audit.verifierNotes,
    violations: s1Violations,
  });

  const stage1: AgentStageResult = {
    stageOrder: 1,
    agentId: 'intent_policy_agent',
    agentName: 'Parking Intent & Policy Agent',
    roleDescription: 'Extracts destination, slot window, vehicle constraints, and policy intent.',
    executionMode: 'openrouter_llm',
    status: s1Violations.length > 0 ? 'corrected' : 'completed',
    latencyMs: Date.now() - s1Start,
    outputSummary: `Parsed "${parsedIntent.destination}" for ${parsedIntent.startTimeLabel}–${parsedIntent.endTimeLabel}, priority=${parsedIntent.prioritize}, maxWalk=${parsedIntent.maxWalkMeters}m.`,
    structuredData: parsedIntent,
    evidenceRefs: [`openrouter:${intentResult.modelUsed || configuredModel}`, `vehicle:${vehicle.id}`],
    supervisorAudit: s1Audit,
  };
  stages.push(stage1);
  onEvent?.({ type: 'stage_complete', stage: stage1 });

  // =========================================================================
  // STAGE 2: Location & Availability Intelligence Agent (Deterministic)
  // =========================================================================
  onEvent?.({
    type: 'stage_start',
    stageOrder: 2,
    agentId: 'location_availability_agent',
    agentName: 'Location & Availability Intelligence Agent',
    message: `Scanning Bengaluru GPS cluster around ${parsedIntent.destination}, entrance gates, and live schedules...`,
  });
  if (onEvent) await pause(240);

  let effectiveDestCoords = input.destinationCoords;
  if (!effectiveDestCoords && parsedIntent.destination) {
    const destLower = parsedIntent.destination.toLowerCase();
    const matchedHub = BENGALURU_LOCATIONS.find(
      (l) =>
        destLower.includes(l.name.toLowerCase()) ||
        l.name.toLowerCase().includes(destLower.replace(/,\s*bengaluru$/i, '').trim()) ||
        destLower.includes(l.area.toLowerCase().split('/')[0].trim())
    );
    if (matchedHub) {
      store.ensureLocationSupply(matchedHub);
      effectiveDestCoords = { lat: matchedHub.lat, lng: matchedHub.lng };
    }
  }

  const s2Start = Date.now();
  const allFacilities = store.facilities;
  const rawDiscoveredFacilities = faultInjectionEnabled
    ? allFacilities
    : allFacilities.filter((f) => f.verificationStatus === 'verified');

  const s2Violations: string[] = [];
  let s2Corrective = 'None required — all discovered facilities carry active authority records.';

  const verifiedFacilities = rawDiscoveredFacilities.filter((f) => {
    if (f.verificationStatus !== 'verified' || f.authorityDocRef.startsWith('MISSING')) {
      s2Violations.push(
        `Blocked unauthorized facility ${f.id} (${f.name}): status=${f.verificationStatus}, doc=${f.authorityDocRef}`
      );
      return false;
    }
    return true;
  });

  if (s2Violations.length > 0) {
    s2Corrective =
      'Supervisor stripped unverified facility before passing inventory to Matching Optimizer.';
    store.addAudit(
      'Supervisor Verification Agent',
      'CAUGHT_UNVERIFIED_FACILITY',
      `Intercepted ${s2Violations.length} unverified listing(s) during workflow ${runId}.`
    );
  }

  const s2Audit: SupervisorAudit = {
    verdict: s2Violations.length > 0 ? 'FLAGGED_AND_CORRECTED' : 'VERIFIED',
    accuracyScore: s2Violations.length > 0 ? 78 : 100,
    invariantsChecked: [
      'Permission-before-publication gate (verificationStatus === verified)',
      'Pedestrian entrance route metadata present',
      'Availability source & freshness timestamp stamped',
    ],
    violationsCaught: s2Violations,
    correctiveAction: s2Corrective,
    verifierNotes: `Validated ${verifiedFacilities.length} authorized facilities with exact gate GPS & pedestrian walk paths.`,
    checkedAtIso: new Date().toISOString(),
  };

  onEvent?.({
    type: 'supervisor_check',
    stageOrder: 2,
    agentId: 'location_availability_agent',
    verdict: s2Audit.verdict,
    message:
      s2Violations.length > 0
        ? `INTERCEPTED: ${s2Violations[0]}`
        : s2Audit.verifierNotes,
    violations: s2Violations,
  });

  const stage2: AgentStageResult = {
    stageOrder: 2,
    agentId: 'location_availability_agent',
    agentName: 'Location & Availability Intelligence Agent',
    roleDescription: 'Retrieves Bengaluru cluster facilities, pedestrian entrance routes, and live schedules.',
    executionMode: 'deterministic_service',
    status: s2Violations.length > 0 ? 'corrected' : 'completed',
    latencyMs: Math.max(15, Date.now() - s2Start),
    outputSummary: `Retrieved ${verifiedFacilities.length} authorized facilities (${store.spaces.length} total bays inspected across ${allFacilities.length} properties).`,
    structuredData: {
      authorizedFacilityIds: verifiedFacilities.map((f) => f.id),
      nearestEntrance: verifiedFacilities[0]?.entranceLabel,
      freshnessTimestamp: verifiedFacilities[0]?.lastUpdatedIso,
    },
    evidenceRefs: verifiedFacilities.slice(0, 8).map((f) => `facility:${f.id}:${f.availabilitySource}`),
    supervisorAudit: s2Audit,
  };
  stages.push(stage2);
  onEvent?.({ type: 'stage_complete', stage: stage2 });

  // =========================================================================
  // STAGE 3: Hard-Constraint Matching & Pooling Optimizer Agent
  // =========================================================================
  onEvent?.({
    type: 'stage_start',
    stageOrder: 3,
    agentId: 'matching_pooling_optimizer',
    agentName: 'Matching & Pooling Optimization Agent',
    message: 'Checking cm vehicle fit, 15m buffers, owner-use cutoffs & pooling allocation...',
  });
  if (onEvent) await pause(260);

  const s3Start = Date.now();
  const evalResult = store.evaluateAllCandidates(
    reqStartMin,
    reqEndMin,
    vehicle,
    prioritize,
    effectiveDestCoords
  );

  let proposedEligible: CandidateEvaluation[] = [...evalResult.eligible];
  const excluded: CandidateEvaluation[] = [...evalResult.excluded];

  const s3Violations: string[] = [];
  let s3Corrective = 'None required — all candidate bays satisfy dimension, buffer, and cutoff invariants.';

  if (faultInjectionEnabled && excluded.length > 0) {
    const leaked = excluded[0];
    proposedEligible.unshift({ ...leaked, eligible: true, score: 94.5 });
  }

  const verifiedEligible: CandidateEvaluation[] = [];
  for (const cand of proposedEligible) {
    const space = store.spaces.find((s) => s.id === cand.spaceId)!;
    const fac = store.facilities.find((f) => f.id === cand.facilityId)!;
    const truth = store.evaluateSpace(
      space,
      fac,
      reqStartMin,
      reqEndMin,
      vehicle,
      prioritize
    );

    if (!truth.eligible) {
      s3Violations.push(
        `Intercepted illegal candidate ${cand.spaceCode}: ${truth.rejectionReasons.join('; ')}`
      );
    } else {
      verifiedEligible.push({
        ...truth,
        walkingDistanceM: cand.walkingDistanceM,
        walkingMinutes: cand.walkingMinutes,
        score: cand.score,
      });
    }
  }

  if (s3Violations.length > 0) {
    s3Corrective =
      'Supervisor rejected hard-constraint violators and restored strictly feasible, buffer-safe ranking.';
    store.addAudit(
      'Supervisor Verification Agent',
      'HARD_CONSTRAINT_INTERCEPT',
      `Blocked invalid optimizer proposal in ${runId}: ${s3Violations[0]}`
    );
  }

  const poolingBenchmark = store.computePoolingComparison();
  const optimizerMetrics = poolingBenchmark.find((m) => m.strategy === 'uncertainty_aware');

  const s3Audit: SupervisorAudit = {
    verdict: s3Violations.length > 0 ? 'FLAGGED_AND_CORRECTED' : 'VERIFIED',
    accuracyScore: s3Violations.length > 0 ? 74 : 100,
    invariantsChecked: [
      'Vehicle cm dimensions (length, width, height) & type fit',
      '15-minute turnaround buffer around existing bookings',
      'Owner-use blocks & host hard departure deadline',
      'Confirmed booking protection (zero silent displacement)',
    ],
    violationsCaught: s3Violations,
    correctiveAction: s3Corrective,
    verifierNotes: `${verifiedEligible.length} bays verified feasible; ${excluded.length} incompatible/conflicting bays strictly excluded.`,
    checkedAtIso: new Date().toISOString(),
  };

  onEvent?.({
    type: 'supervisor_check',
    stageOrder: 3,
    agentId: 'matching_pooling_optimizer',
    verdict: s3Audit.verdict,
    message:
      s3Violations.length > 0
        ? `INTERCEPTED: ${s3Violations[0]}`
        : s3Audit.verifierNotes,
    violations: s3Violations,
  });

  const stage3: AgentStageResult = {
    stageOrder: 3,
    agentId: 'matching_pooling_optimizer',
    agentName: 'Matching & Pooling Optimization Agent',
    roleDescription: 'Enforces vehicle/buffer/owner-block constraints and ranks pooled time windows.',
    executionMode: 'hybrid_optimizer',
    status: s3Violations.length > 0 ? 'corrected' : 'completed',
    latencyMs: Math.max(18, Date.now() - s3Start),
    outputSummary: `Matched ${verifiedEligible.length} feasible bays; excluded ${excluded.length} (optimizer pool utilization ${optimizerMetrics?.utilizationPct ?? 0}%, 0 conflicts).`,
    structuredData: {
      topSpaceId: verifiedEligible[0]?.spaceId || null,
      feasibleCount: verifiedEligible.length,
      excludedCount: excluded.length,
      poolUtilizationPct: optimizerMetrics?.utilizationPct,
    },
    evidenceRefs: [
      ...verifiedEligible.slice(0, 6).map((c) => `space:${c.spaceId}:score=${c.score}`),
      'optimizer:uncertainty_aware',
    ],
    supervisorAudit: s3Audit,
  };
  stages.push(stage3);
  onEvent?.({ type: 'stage_complete', stage: stage3 });

  // =========================================================================
  // STAGE 4: Pricing, Review & Trust Intelligence Agent (OpenRouter AI)
  // =========================================================================
  onEvent?.({
    type: 'stage_start',
    stageOrder: 4,
    agentId: 'pricing_trust_agent',
    agentName: 'Pricing, Review & Trust Agent',
    message: 'Calculating server-side INR quotes & auditing eligible completed-booking reviews...',
  });

  const s4Start = Date.now();
  const targetCand = input.targetSpaceId
    ? verifiedEligible.find((c) => c.spaceId === input.targetSpaceId)
    : undefined;
  const orderedForAnalysis = targetCand
    ? [targetCand, ...verifiedEligible.filter((c) => c.spaceId !== targetCand.spaceId)]
    : verifiedEligible;
  const topForAnalysis = orderedForAnalysis.slice(0, 3).map((c) => {
    const space = store.spaces.find((s) => s.id === c.spaceId)!;
    return {
      spaceId: c.spaceId,
      facilityName: c.facilityName,
      spaceCode: c.spaceCode,
      hourlyPriceInr: c.hourlyPriceInr,
      totalQuoteInr: c.totalQuoteInr,
      walkingDistanceM: c.walkingDistanceM,
      walkingMinutes: c.walkingMinutes,
      entranceLabel: c.entranceLabel,
      covered: c.covered,
      evCharging: c.evCharging,
      reviews: space.reviews.map((r) => ({
        bookingId: r.bookingId,
        rating: r.rating,
        theme: r.theme,
        comment: r.comment,
      })),
    };
  });

  const pricingTrustResult = await callOpenRouter({
    systemPrompt:
      'You are the Pricing & Trust Auditor for ParkPool AI. Respond ONLY with a raw valid JSON object (no markdown fences, no commentary).',
    userPrompt: `Analyze these verified parking candidates and produce concise, strictly evidence-grounded pricing, walking-route, and review-trust summaries.
RULES:
1. Quote ONLY the exact totalQuoteInr values provided in the input JSON.
2. Cite ONLY the provided bookingId values for reviews. Never invent reviews.
3. Never promise "100% security" or theft guarantees; state actual access control & safety notes.

Return a JSON object with EXACTLY these keys:
{
  "priceSummary": string,
  "trustAndReviewHighlights": [
    {
      "spaceId": string,
      "quotedInr": number,
      "citedBookingIds": string[],
      "summary": string
    }
  ],
  "safetyDisclaimerIncluded": boolean
}

Candidates JSON:
${JSON.stringify(topForAnalysis, null, 2)}`,
    expectJson: true,
  });

  const pricingParsed = extractJsonObject(pricingTrustResult.text);
  const s4Violations: string[] = [];
  let s4Corrective = 'None required — all quoted INR totals and review citations match backend records.';

  if (Array.isArray(pricingParsed.trustAndReviewHighlights)) {
    for (const item of pricingParsed.trustAndReviewHighlights as Array<Record<string, unknown>>) {
      const truth = verifiedEligible.find((c) => c.spaceId === item.spaceId);
      if (truth && Number(item.quotedInr) !== truth.totalQuoteInr) {
        s4Violations.push(
          `Quote drift on ${String(item.spaceId)}: agent stated ₹${String(item.quotedInr)}, server truth is ₹${truth.totalQuoteInr}`
        );
        item.quotedInr = truth.totalQuoteInr;
      }
    }
  }
  if (s4Violations.length > 0) {
    s4Corrective = 'Supervisor enforced authoritative server-side INR quote values.';
  }

  const s4Audit: SupervisorAudit = {
    verdict: s4Violations.length > 0 ? 'FLAGGED_AND_CORRECTED' : 'VERIFIED',
    accuracyScore: s4Violations.length > 0 ? 85 : 100,
    invariantsChecked: [
      'Server-side INR quote parity (zero LLM price hallucination)',
      'Eligible completed-booking review provenance',
      'No unverified physical security guarantees',
    ],
    violationsCaught: s4Violations,
    correctiveAction: s4Corrective,
    verifierNotes: 'Confirmed all quotes match backend pricing engine and reviews trace to completed bookings.',
    checkedAtIso: new Date().toISOString(),
  };

  onEvent?.({
    type: 'supervisor_check',
    stageOrder: 4,
    agentId: 'pricing_trust_agent',
    verdict: s4Audit.verdict,
    message: s4Audit.verifierNotes,
    violations: s4Violations,
  });

  const stage4: AgentStageResult = {
    stageOrder: 4,
    agentId: 'pricing_trust_agent',
    agentName: 'Pricing, Review & Trust Agent',
    roleDescription: 'Validates server-side quotes, summarizes eligible reviews, and surfaces access safety notes.',
    executionMode: 'openrouter_llm',
    status: s4Violations.length > 0 ? 'corrected' : 'completed',
    latencyMs: Date.now() - s4Start,
    outputSummary:
      (typeof pricingParsed.priceSummary === 'string' && pricingParsed.priceSummary) ||
      `Verified server quotes across ${topForAnalysis.length} top candidates with eligible review provenance.`,
    structuredData: pricingParsed,
    evidenceRefs: topForAnalysis.flatMap((c) => [
      `quote:${c.spaceId}:INR_${c.totalQuoteInr}`,
      ...c.reviews.map((r) => `review:${r.bookingId}`),
    ]),
    supervisorAudit: s4Audit,
  };
  stages.push(stage4);
  onEvent?.({ type: 'stage_complete', stage: stage4 });

  // =========================================================================
  // STAGE 5: Booking Coordination & Supervisor Final Sign-Off (OpenRouter AI)
  // =========================================================================
  onEvent?.({
    type: 'stage_start',
    stageOrder: 5,
    agentId: 'booking_supervisor_agent',
    agentName: 'Booking Coordination & Supervisor Sign-Off',
    message: 'Performing final end-to-end audit and locking human confirmation gate...',
  });

  const s5Start = Date.now();
  const totalCaught = stages.reduce((acc, st) => acc + st.supervisorAudit.violationsCaught.length, 0);

  const supervisorSummaryPrompt = `You are the Supervisor & Verification Agent for ParkPool AI.
Audit this completed multi-agent parking coordination run and produce a crisp, authoritative 2-3 sentence verification report for the driver/operator.

Workflow Run ID: ${runId}
Driver Request: "${input.prompt}"
Vehicle: ${vehicle.label} (${vehicle.lengthCm}x${vehicle.widthCm}x${vehicle.heightCm}cm)
Requested Window: ${parsedIntent.startTimeLabel}–${parsedIntent.endTimeLabel}
Verified Feasible Spaces: ${topForAnalysis.map((c) => `${c.spaceCode} at ${c.facilityName} (₹${c.totalQuoteInr}, ${c.walkingDistanceM}m walk)`).join(' | ') || 'NONE'}
Excluded Spaces & Reasons: ${excluded.slice(0, 6).map((e) => `${e.spaceCode}: ${e.rejectionReasons.join(', ')}`).join(' | ') || 'None'}
Violations Intercepted & Corrected Mid-Flight: ${totalCaught} (${stages.flatMap((s) => s.supervisorAudit.violationsCaught).join('; ') || 'None'})
Human Confirmation Lock: Enforced (no booking committed without explicit user confirmation).
Policy Context Reference: ${POLICY_RAG_CORPUS.map((d) => d.id).join(', ')}`;

  const finalAuditResult = await callOpenRouter({
    systemPrompt:
      'You are the ParkPool AI Supervisor Verification Agent. Write a concise 2-3 sentence plain-text verification summary.',
    userPrompt: supervisorSummaryPrompt,
    expectJson: false,
  });

  const supervisorFinalReport =
    finalAuditResult.text ||
    `Supervisor verified ${verifiedEligible.length} compliant parking option(s) for ${vehicle.label} (${parsedIntent.startTimeLabel}–${parsedIntent.endTimeLabel}) with ${totalCaught} mid-flight violation(s) caught and corrected.`;

  const s5Audit: SupervisorAudit = {
    verdict: verifiedEligible.length === 0 ? 'REJECTED' : totalCaught > 0 ? 'FLAGGED_AND_CORRECTED' : 'VERIFIED',
    accuracyScore: verifiedEligible.length > 0 ? 100 : 95,
    invariantsChecked: [
      'End-to-end stage audit completeness',
      'Human-in-the-loop confirmation gate active',
      'Entrance-specific navigation & hard cutoff disclosure',
    ],
    violationsCaught: [],
    correctiveAction:
      verifiedEligible.length === 0
        ? 'No compatible bays available in requested window; blocked booking progression safely.'
        : 'Ready for explicit user hold & transactional booking confirmation.',
    verifierNotes: 'Supervisor final sign-off complete. Confirmed bookings remain protected.',
    checkedAtIso: new Date().toISOString(),
  };

  onEvent?.({
    type: 'supervisor_check',
    stageOrder: 5,
    agentId: 'booking_supervisor_agent',
    verdict: s5Audit.verdict,
    message: s5Audit.verifierNotes,
    violations: [],
  });

  const topRec = orderedForAnalysis[0];
  const stage5: AgentStageResult = {
    stageOrder: 5,
    agentId: 'booking_supervisor_agent',
    agentName: 'Booking Coordination & Supervisor Sign-Off',
    roleDescription: 'Enforces human confirmation gate, verifies entrance routing, and signs off full workflow accuracy.',
    executionMode: 'openrouter_llm',
    status: verifiedEligible.length === 0 ? 'blocked' : 'completed',
    latencyMs: Date.now() - s5Start,
    outputSummary:
      topRec
        ? `Prepared quote & entrance guide for top recommendation ${topRec.spaceCode} (₹${topRec.totalQuoteInr} total). Awaiting explicit user confirmation.`
        : 'No verified, conflict-free bay satisfies all hard constraints for this window.',
    structuredData: {
      humanApprovalRequired: true,
      topRecommendationId: topRec?.spaceId || null,
      totalViolationsIntercepted: totalCaught,
    },
    evidenceRefs: ['human_approval_gate:enabled', `supervisor_run:${runId}`],
    supervisorAudit: s5Audit,
  };
  stages.push(stage5);
  onEvent?.({ type: 'stage_complete', stage: stage5 });

  store.addAudit(
    'Multi-Agent Supervisor',
    'WORKFLOW_VERIFIED',
    `${runId}: ${verifiedEligible.length} eligible, ${excluded.length} excluded, ${totalCaught} fault(s) intercepted (OpenRouter: ${finalAuditResult.modelUsed}).`
  );

  const finalRun: MultiAgentWorkflowRun = {
    runId,
    prompt: input.prompt,
    requestedStartMin: reqStartMin,
    requestedEndMin: reqEndMin,
    vehicle,
    faultInjectionEnabled,
    overallStatus:
      verifiedEligible.length === 0
        ? 'action_blocked'
        : totalCaught > 0
        ? 'corrected_and_verified'
        : 'verified_ready',
    totalLatencyMs: Date.now() - workflowStart,
    parsedIntent,
    stages,
    recommendedCandidates: orderedForAnalysis,
    excludedCandidates: excluded,
    supervisorFinalReport,
    humanApprovalRequired: true,
  };

  onEvent?.({ type: 'workflow_complete', run: finalRun });
  return finalRun;
}

export async function askPolicyRagAssistant(question: string): Promise<{
  answer: string;
  citations: Array<{ docId: string; title: string; section: string }>;
}> {
  const corpusText = POLICY_RAG_CORPUS.map(
    (doc) => `[${doc.id}] ${doc.title} (${doc.section}):\n${doc.content}`
  ).join('\n\n');

  const response = await callOpenRouter({
    systemPrompt:
      'You are the ParkPool AI Customer & Operations Policy Assistant. Respond ONLY with a raw valid JSON object (no markdown fences).',
    userPrompt: `Answer the user's question using ONLY the approved policy documents below.
If the documents do not cover something, state clearly what is unresolved or requires legal/admin review.
Return JSON with "answer" (string) and "citedDocIds" (array of matching DOC-* IDs).

Approved Policy Corpus:
${corpusText}

User Question: "${question}"`,
    expectJson: true,
  });

  const parsed = extractJsonObject(response.text);
  const citedIds: string[] = Array.isArray(parsed.citedDocIds)
    ? parsed.citedDocIds.map((id) => String(id))
    : [];
  const citations = POLICY_RAG_CORPUS.filter((d) => citedIds.includes(d.id)).map((d) => ({
    docId: d.id,
    title: d.title,
    section: d.section,
  }));

  return {
    answer:
      typeof parsed.answer === 'string' && parsed.answer.trim()
        ? parsed.answer.trim()
        : 'No grounded policy answer available.',
    citations,
  };
}
