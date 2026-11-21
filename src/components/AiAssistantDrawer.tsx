import React, { useState } from 'react';
import {
  Bot,
  CheckCircle2,
  MapPin,
  Radio,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  CandidateEvaluation,
  MultiAgentWorkflowRun,
  VehicleProfile,
} from '../types/parkpool';

interface AiAssistantDrawerProps {
  open: boolean;
  onClose: () => void;
  vehicles: VehicleProfile[];
  selectedVehicleId: string;
  onCreateHold: (params: {
    spaceId: string;
    vehicleId: string;
    startMin: number;
    endMin: number;
  }) => Promise<void>;
  onNavigateDashboard: () => void;
}

type AssistantEntry =
  | { id: string; role: 'user'; text: string }
  | {
      id: string;
      role: 'assistant';
      kind: 'search';
      run: MultiAgentWorkflowRun;
    }
  | {
      id: string;
      role: 'assistant';
      kind: 'policy';
      answer: string;
      citations: Array<{ docId: string; title: string; section: string }>;
    }
  | {
      id: string;
      role: 'assistant';
      kind: 'error';
      text: string;
    };

const QUICK_CHIPS: Array<{
  label: string;
  mode: 'search' | 'policy';
  prompt: string;
}> = [
  {
    label: 'Best covered EV spot',
    mode: 'search',
    prompt: 'Find a covered EV parking spot near Phoenix Mall from 14:00 to 17:30.',
  },
  {
    label: 'Cheapest parking nearby',
    mode: 'search',
    prompt: 'Find the lowest price verified parking near Phoenix Mall from 14:00 to 17:30.',
  },
  {
    label: 'Closest gate under 300m',
    mode: 'search',
    prompt: 'Find the closest parking under 300m walk from 14:00 to 17:30.',
  },
  {
    label: 'Late departure policy?',
    mode: 'policy',
    prompt: 'What happens if I depart after the closing cutoff or need an extension?',
  },
  {
    label: 'Cancellation rules?',
    mode: 'policy',
    prompt: 'What are the cancellation and hold expiry rules?',
  },
];

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({
  open,
  onClose,
  vehicles,
  selectedVehicleId,
  onCreateHold,
  onNavigateDashboard,
}) => {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [bookingBayId, setBookingBayId] = useState<string | null>(null);
  const [entries, setEntries] = useState<AssistantEntry[]>([]);

  if (!open) return null;

  const activeVehicle = vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0];

  const runAssistant = async (prompt: string, explicitMode?: 'search' | 'policy') => {
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;

    const inferredPolicy =
      explicitMode === 'policy' ||
      (!explicitMode &&
        /policy|cancel|refund|cutoff|late|rule|fee|gst|extension/i.test(trimmed));

    setEntries((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', text: trimmed },
    ]);
    setInput('');
    setBusy(true);

    try {
      if (inferredPolicy) {
        const res = await fetch('/api/rag/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: trimmed }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Policy assistant failed');
        setEntries((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            kind: 'policy',
            answer: data.answer,
            citations: data.citations || [],
          },
        ]);
      } else {
        const res = await fetch('/api/agents/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: trimmed,
            vehicleId: activeVehicle?.id || 'VEH-SUV-01',
            defaultStartTime: '14:00',
            defaultEndTime: '17:30',
            faultInjectionEnabled: false,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Assistant search failed');
        setEntries((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            kind: 'search',
            run: data as MultiAgentWorkflowRun,
          },
        ]);
      }
    } catch (err: unknown) {
      setEntries((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          kind: 'error',
          text: err instanceof Error ? err.message : 'Unable to reach assistant.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const handleBookCandidate = async (
    cand: CandidateEvaluation,
    run: MultiAgentWorkflowRun
  ) => {
    setBookingBayId(cand.spaceId);
    try {
      await onCreateHold({
        spaceId: cand.spaceId,
        vehicleId: run.vehicle.id,
        startMin: run.requestedStartMin,
        endMin: run.requestedEndMin,
      });
      onClose();
      onNavigateDashboard();
    } finally {
      setBookingBayId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[3px]">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        {/* Vibrant Ride-App Assistant Header */}
        <div className="flex items-center justify-between border-b border-black/[0.06] bg-white/95 px-5 py-4 text-[#111827] backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#4338CA] to-[#C83709] text-white shadow-sm">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold">AI Parking Assistant</h2>
              <p className="text-[11px] text-[#4B5563]">
                Verified by Supervisor · {activeVehicle?.label}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Assistant"
            className="rounded-lg p-1.5 text-[#4B5563] hover:bg-black/[0.05] hover:text-[#111827]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quick Multi-Choice Chips */}
        <div className="border-b border-black/[0.06] bg-[#F8F7F4] px-4 py-3">
          <div className="mb-2 text-[11px] font-semibold text-[#4B5563]">Quick Questions</div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                disabled={busy}
                onClick={() => void runAssistant(chip.prompt, chip.mode)}
                className="rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs font-medium text-[#111827] transition-colors hover:border-[#D93F0B] hover:text-[#C83709] disabled:opacity-50"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {entries.length === 0 && (
            <div className="rounded-xl border border-black/[0.06] bg-[#F8F7F4] p-4 text-xs text-[#374151]">
              <div className="flex items-center gap-1.5 font-semibold text-[#111827]">
                <ShieldCheck className="h-4 w-4 text-[#4338CA]" />
                <span>How can I help?</span>
              </div>
              <p className="mt-1.5 leading-relaxed">
                Pick a quick question above or ask me to find verified spots, compare walk
                distances, or check parking policies.
              </p>
            </div>
          )}

          {entries.map((entry) => {
            if (entry.role === 'user') {
              return (
                <div key={entry.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl bg-[#4338CA] px-3.5 py-2.5 text-xs text-white shadow-sm">
                    {entry.text}
                  </div>
                </div>
              );
            }

            if (entry.kind === 'error') {
              return (
                <div
                  key={entry.id}
                  className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
                >
                  {entry.text}
                </div>
              );
            }

            if (entry.kind === 'policy') {
              return (
                <div
                  key={entry.id}
                  className="space-y-2 rounded-xl border border-black/[0.06] bg-[#F8F7F4] p-3.5 text-xs text-[#111827]"
                >
                  <p className="leading-relaxed">{entry.answer}</p>
                  {entry.citations.length > 0 && (
                    <div className="border-t border-black/[0.06] pt-2 text-[11px] text-[#4B5563]">
                      Source: {entry.citations.map((c) => c.title).join(' · ')}
                    </div>
                  )}
                </div>
              );
            }

            const topBays = entry.run.recommendedCandidates.slice(0, 3);
            return (
              <div
                key={entry.id}
                className="space-y-2.5 rounded-xl border border-black/[0.06] bg-[#F8F7F4] p-3.5 text-xs"
              >
                <div className="flex items-center gap-1.5 font-semibold text-[#047857]">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Supervisor Verified Match</span>
                </div>
                <p className="leading-relaxed text-[#374151]">
                  {entry.run.supervisorFinalReport}
                </p>

                {topBays.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {topBays.map((cand) => (
                      <div
                        key={cand.spaceId}
                        className="flex items-center justify-between gap-2 rounded-xl border border-black/[0.06] bg-white p-2.5"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-display text-xs font-bold text-[#111827]">
                            {cand.facilityName}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[#4B5563]">
                            <MapPin className="h-3 w-3 text-[#C83709]" />
                            <span>
                              {cand.spaceCode} · {cand.walkingDistanceM}m · ₹{cand.totalQuoteInr}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={bookingBayId === cand.spaceId}
                          onClick={() => void handleBookCandidate(cand, entry.run)}
                          className="whitespace-nowrap shrink-0 rounded-lg bg-gradient-to-r from-[#E0430D] to-[#C83709] px-3 py-1.5 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50"
                        >
                          {bookingBayId === cand.spaceId ? '...' : 'Book'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {busy && (
            <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs font-medium text-[#4338CA]">
              <Radio className="h-4 w-4 animate-spin" />
              <span>Checking availability & Supervisor rules...</span>
            </div>
          )}
        </div>

        {/* Bottom Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runAssistant(input);
          }}
          className="flex items-center gap-2 border-t border-black/[0.06] bg-white p-3.5"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about parking or policies..."
            className="flex-1 rounded-xl border border-black/[0.1] bg-[#F8F7F4] px-3.5 py-2 text-xs text-[#111827] focus:border-[#4338CA] focus:bg-white focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4338CA] text-white hover:bg-[#3730A3] disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
