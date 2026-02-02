import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const items = [
  {
    value: "item-1",
    trigger: "how did you guys build search?",
    content: "we index your files to make them searchable semantically",
  },
  {
    value: "item-2",
    trigger: "is my data safe?",
    content:
      "Yes. we are currently not hosting anything ourselves, this is built as a fully-local system. When we eventually provide hosting, we will encypt all user data.",
  },
  {
    value: "item-3",
    trigger: "is it fast?",
    content:
      "Yes. Can it be faster? Definitely. That's the goal. We will keep building it till it's the fastest it can be.",
  },
  {
    value: "item-4",
    trigger: "ew but this is electron!",
    content:
      "We are aware. We know it sucks. This started as something we wanted to use and wanted to ship ASAP. We will eventually write it in GPUI - Zed's GPU UI Framework Library ",
  },
];

export function Features() {
  return (
    <Accordion type="single" collapsible className="max-w-lg">
      {items.map((item) => (
        <AccordionItem key={item.value} value={item.value}>
          <AccordionTrigger>{item.trigger}</AccordionTrigger>
          <AccordionContent>{item.content}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
