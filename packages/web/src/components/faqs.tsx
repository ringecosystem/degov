const faqList = {
  general: [
    {
      title: "What is delegation? ↗",
      link: "https://docs.degov.ai/",
    },
    {
      title: "What is voting power? ↗",
      link: "https://docs.degov.ai/",
    },
    {
      title: "How are governance tokens and voting power related? ↗",
      link: "https://docs.degov.ai/",
    },
    {
      title: "How can I delegate my voting power? ↗",
      link: "https://docs.degov.ai/",
    },
    {
      title:
        "Can I split my voting power and delegate it to multiple delegates? ↗",
      link: "https://docs.degov.ai/",
    },
  ],
  delegate: [
    {
      title: "What is delegation? ↗",
      link: "https://docs.degov.ai/",
    },
    {
      title: "What is voting power? ↗",
      link: "https://docs.degov.ai/",
    },
    {
      title: "How are governance tokens and voting power related? ↗",
      link: "https://docs.degov.ai/",
    },
    {
      title: "How can I delegate my voting power? ↗",
      link: "https://docs.degov.ai/",
    },
    {
      title:
        "Can I split my voting power and delegate it to multiple delegates? ↗",
      link: "https://docs.degov.ai/",
    },
  ],
  proposal: [
    {
      title: "What is delegation? ↗",
      link: "https://docs.degov.ai/",
    },
    {
      title: "What is voting power? ↗",
      link: "https://docs.degov.ai/",
    },
    {
      title: "How are governance tokens and voting power related? ↗",
      link: "https://docs.degov.ai/",
    },
    {
      title: "How can I delegate my voting power? ↗",
      link: "https://docs.degov.ai/",
    },
    {
      title:
        "Can I split my voting power and delegate it to multiple delegates? ↗",
      link: "https://docs.degov.ai/",
    },
  ],
};

interface FaqsProps {
  type: "general" | "delegate" | "proposal";
}

export const Faqs = ({ type }: FaqsProps) => {
  return (
    <div className="flex flex-col gap-[20px] p-[20px] bg-card rounded-[14px] w-[360px]">
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
            className="text-[14px] font-normal hover:underline"
          >
            {faq.title}
          </a>
        </div>
      ))}
    </div>
  );
};
