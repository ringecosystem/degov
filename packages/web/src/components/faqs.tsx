import { ArrowUpRight } from "lucide-react";

const faqList = {
  general: [
    {
      title: "What is DeGov.AI",
      link: "https://docs.degov.ai/",
    },
    {
      title: "How can my DAO get support from DeGov.AI?",
      link: "https://docs.degov.ai/faqs/#how-can-my-dao-get-support-from-degovai",
    },
    {
      title: "How is AI integrated into DeGov.AI?",
      link: "https://docs.degov.ai/faqs/#how-does-degovai-utilize-ai-capabilities",
    },
    {
      title: "How can I create or vote on proposals?",
      link: "https://docs.degov.ai/faqs/#how-can-i-create-or-vote-on-proposals",
    },
    {
      title: "Is there an off-chain platform for discussing proposals?",
      link: "https://docs.degov.ai/faqs/#is-there-an-off-chain-platform-for-discussing-proposals",
    },
  ],
  delegate: [
    {
      title: "What is delegation?",
      link: "https://docs.degov.ai/faqs/#what-is-delegation",
    },
    {
      title: "What is voting power?",
      link: "https://docs.degov.ai/faqs/#what-is-voting-power",
    },
    {
      title: "How are governance tokens and voting power related?",
      link: "https://docs.degov.ai/faqs/#how-are-governance-tokens-and-voting-power-related",
    },
    {
      title: "How can I delegate my voting power?",
      link: "https://docs.degov.ai/faqs/#how-can-i-delegate-my-voting-power",
    },
    {
      title:
        "Can I split my voting power and delegate it to multiple delegates?",
      link: "https://docs.degov.ai/faqs/#can-i-split-my-voting-power-and-delegate-it-to-multiple-delegates",
    },
  ],
  proposal: [
    {
      title: "What is the proposal threshold?",
      link: "https://docs.degov.ai/faqs/#what-is-the-proposal-threshold",
    },
    {
      title: "What is the lifecycle of a proposal?",
      link: "https://docs.degov.ai/faqs/#what-is-the-lifecycle-of-a-proposal",
    },
    {
      title: "What are the best practices for creating a proposal?",
      link: "https://docs.degov.ai/faqs/#what-are-the-best-practices-for-creating-a-proposal",
    },
    {
      title: "How can I vote on a proposal?",
      link: "https://docs.degov.ai/faqs/#how-can-i-vote-on-a-proposal",
    },
    {
      title: "How can I check the status of a proposal?",
      link: "https://docs.degov.ai/faqs/#how-can-i-check-the-status-of-a-proposal",
    },
  ],
};

interface FaqsProps {
  type: "general" | "delegate" | "proposal";
}

export const Faqs = ({ type }: FaqsProps) => {
  return (
    <div className="flex flex-col gap-[20px] p-[20px] bg-card rounded-[14px] lg:w-[360px]">
      <h2 className="text-[18px] font-semibold">
        {type.charAt(0).toUpperCase() + type.slice(1)} FAQs
      </h2>
      <div className="h-[1px] w-full bg-card-background"></div>
      {faqList[type].map((faq) => (
        <div key={faq.title}>
          <a
            href={faq.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[14px] font-normal hover:underline "
          >
            {faq.title} <ArrowUpRight className="w-4 h-4 inline-block" />
          </a>
        </div>
      ))}
    </div>
  );
};
