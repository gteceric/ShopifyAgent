"use client";

import {
  fetchWithTimeout,
  isRequestTimeoutError,
} from "@shopify-agent/core";
import type { FetchWithTimeoutOptions } from "@shopify-agent/core";
import { useState } from "react";
import type { RefundDecision } from "./mock-orders";
import { getDecisionLabel } from "./dashboard-helpers";
import type {
  RefundAgentErrorResponse,
  RefundAgentProvider,
  RefundAgentRequest,
  RefundAgentResponse,
} from "./refund-agent-contract";

interface MerchantQuestionPanelProps {
  orderId: string;
  shopDomain: string | null;
  decision: RefundDecision;
}

const REFUND_AGENT_REQUEST_TIMEOUT_MS = 30_000;

const STARTER_QUESTIONS = [
  "Can I refund this order?",
  "Should this be escalated to manual review?",
  "What should the support agent do next?",
];

function getProviderLabel(provider: RefundAgentProvider): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "ollama":
      return "Ollama";
    case "fallback":
      return "Deterministic fallback";
  }
}

export function MerchantQuestionPanel({
  orderId,
  shopDomain,
  decision,
}: MerchantQuestionPanelProps) {
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<RefundAgentResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function submitQuestion(nextQuestion: string) {
    const trimmedQuestion = nextQuestion.trim();

    if (!trimmedQuestion) {
      setErrorMessage("Enter a question for the refund agent.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const requestBody: RefundAgentRequest = {
        orderId,
        shopDomain,
        question: trimmedQuestion,
      };
      const refundAgentRequest: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      };
      const refundAgentRequestOptions: FetchWithTimeoutOptions = {
        fetchImpl: fetch,
        timeoutMs: REFUND_AGENT_REQUEST_TIMEOUT_MS,
      };
      const response = await fetchWithTimeout(
        "/api/refund-agent",
        refundAgentRequest,
        refundAgentRequestOptions,
      );
      const payload = (await response.json()) as
        | RefundAgentResponse
        | RefundAgentErrorResponse;

      if (!response.ok || !("response" in payload)) {
        throw new Error(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Refund agent request failed.",
        );
      }

      setReply(payload);
    } catch (error) {
      setReply(null);
      setErrorMessage(
        isRequestTimeoutError(error)
          ? "Refund agent request timed out."
          : error instanceof Error
            ? error.message
            : "Refund agent request failed.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-[24px] border border-stone-900/10 bg-stone-50/90 p-5">
      <div className="grid gap-1">
        <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
          Ask The Refund Agent
        </p>
        <p className="text-sm leading-6 text-stone-600">
          Ask an internal question about this order. The answer is grounded in
          the latest refund decision, not a customer-facing auto-reply.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STARTER_QUESTIONS.map((starterQuestion) => (
          <button
            key={starterQuestion}
            type="button"
            className="rounded-full border border-stone-900/10 bg-stone-50 px-3 py-2 text-sm text-stone-700 transition hover:border-stone-900/20 hover:bg-stone-100"
            onClick={() => {
              //setQuestion(starterQuestion);
              // start this async work, and intentionally ignore the returned promise value.
              void submitQuestion(starterQuestion);
            }}
          >
            {starterQuestion}
          </button>
        ))}
      </div>

      <label className="grid gap-2">
        <span className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
          Merchant Question
        </span>
        <textarea
          className="min-h-28 w-full rounded-[22px] border border-stone-900/15 bg-stone-50 px-4 py-3 text-sm leading-6 outline-none transition focus:border-stone-900/30 focus:ring-2 focus:ring-orange-700/15"
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
          }}
          placeholder="Example: Can I refund this order, or does it need manual review?"
        />
      </label>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-stone-500">
          Current dashboard posture: {getDecisionLabel(decision)}
        </p>
        <button
          type="button"
          className="rounded-full bg-stone-950 px-4 py-2.5 text-sm font-medium text-stone-50 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
          disabled={isLoading}
          onClick={() => {
            void submitQuestion(question);
          }}
        >
          {isLoading ? "Thinking..." : "Ask"}
        </button>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-900/10 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">
          {errorMessage}
        </div>
      ) : null}

      {reply ? (
        <div className="grid gap-3 rounded-[22px] border border-stone-900/10 bg-white/70 p-4">
          <div className="flex flex-wrap gap-2 text-sm text-stone-600">
            <span className="rounded-full border border-stone-900/10 bg-stone-50 px-3 py-1.5">
              Decision: {getDecisionLabel(reply.decision)}
            </span>
            <span className="rounded-full border border-stone-900/10 bg-stone-50 px-3 py-1.5">
              Next step: {reply.recommendedNextAction}
            </span>
            <span className="rounded-full border border-stone-900/10 bg-stone-50 px-3 py-1.5">
              Response mode: {reply.usedFallback ? "Deterministic fallback" : "AI-assisted"}
            </span>
            <span className="rounded-full border border-stone-900/10 bg-stone-50 px-3 py-1.5">
              Provider: {getProviderLabel(reply.provider)}
            </span>
          </div>

          <p className="text-sm leading-7 text-stone-800">{reply.response}</p>

          {reply.reasons.length > 0 ? (
            <div className="grid gap-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
                Supporting Reasons
              </p>
              <ul className="grid gap-2 text-sm leading-6 text-stone-600">
                {reply.reasons.map((reason) => (
                  <li
                    key={reason}
                    className="border-l-2 border-orange-700/25 pl-3"
                  >
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
