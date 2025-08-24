import { ArrowUpRight } from "lucide-react";
import { useMemo } from "react";

import { useDaoConfig } from "@/hooks/useDaoConfig";

const defaultFaqList = {
  general: [
    {
      question: "What is DeGov.AI?",
      answer: "https://docs.degov.ai/",
    },
    {
      question: "How can my DAO get support from DeGov.AI?",
      answer:
        "https://docs.degov.ai/faqs/#how-can-my-dao-get-support-from-degovai",
    },
    {
      question: "How is AI integrated into DeGov.AI?",
      answer:
        "https://docs.degov.ai/faqs/#how-does-degovai-utilize-ai-capabilities",
    },
    {
      question: "How can I create or vote on proposals?",
      answer:
        "https://docs.degov.ai/faqs/#how-can-i-create-or-vote-on-proposals",
    },
    {
      question: "Is there an off-chain platform for discussing proposals?",
      answer:
        "https://docs.degov.ai/faqs/#is-there-an-off-chain-platform-for-discussing-proposals",
    },
  ],
  delegate: [
    {
      question: "What is delegation?",
      answer: "https://docs.degov.ai/faqs/#what-is-delegation",
    },
    {
      question: "What is voting power?",
      answer: "https://docs.degov.ai/faqs/#what-is-voting-power",
    },
    {
      question: "How are governance tokens and voting power related?",
      answer:
        "https://docs.degov.ai/faqs/#how-are-governance-tokens-and-voting-power-related",
    },
    {
      question: "How can I delegate my voting power?",
      answer: "https://docs.degov.ai/faqs/#how-can-i-delegate-my-voting-power",
    },
    {
      question:
        "Can I split my voting power and delegate it to multiple delegates?",
      answer:
        "https://docs.degov.ai/faqs/#can-i-split-my-voting-power-and-delegate-it-to-multiple-delegates",
    },
  ],
  proposal: [
    {
      question: "What is the proposal threshold?",
      answer: "https://docs.degov.ai/faqs/#what-is-the-proposal-threshold",
    },
    {
      question: "What is the lifecycle of a proposal?",
      answer: "https://docs.degov.ai/faqs/#what-is-the-lifecycle-of-a-proposal",
    },
    {
      question: "What are the best practices for creating a proposal?",
      answer:
        "https://docs.degov.ai/faqs/#what-are-the-best-practices-for-creating-a-proposal",
    },
    {
      question: "How can I vote on a proposal?",
      answer: "https://docs.degov.ai/faqs/#how-can-i-vote-on-a-proposal",
    },
    {
      question: "How can I check the status of a proposal?",
      answer:
        "https://docs.degov.ai/faqs/#how-can-i-check-the-status-of-a-proposal",
    },
  ],
};

interface FaqsProps {
  type: "general" | "delegate" | "proposal";
}

export const Faqs = ({ type }: FaqsProps) => {
  const config = useDaoConfig();

  const faqList = useMemo(() => {
    if (type === "general") {
      return config?.theme?.faqs && config.theme.faqs.length > 0
        ? config.theme.faqs?.slice(0, 5)
        : defaultFaqList[type];
    }
    return defaultFaqList[type];
  }, [config, type]);

  return (
    <div className="flex flex-col gap-[20px] p-[20px] bg-card rounded-[14px] lg:w-[360px] shadow-card">
      <h2 className="text-[18px] font-semibold">
        {type.charAt(0).toUpperCase() + type.slice(1)} FAQs
      </h2>
      <div className="h-[1px] w-full bg-card-background"></div>
      {(Array.isArray(faqList) ? faqList : []).map((faq, index) => (
        <div key={index}>
          <a
            href={faq.answer}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[14px] font-normal hover:underline "
          >
            {faq.question} <ArrowUpRight className="w-4 h-4 inline-block" />
          </a>
        </div>
      ))}
    </div>
  );
};
