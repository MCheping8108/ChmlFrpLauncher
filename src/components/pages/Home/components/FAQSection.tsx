import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function FAQSection() {
  return (
    <div className="border border-border/60 rounded-lg p-5 bg-card md:col-span-3">
      <h2 className="text-sm font-semibold text-foreground mb-3">常见问题</h2>
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="item-1">
          <AccordionTrigger>软件出现了BUG怎么办</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-4 text-balance">
            <p>
              软件目前为公开测试版，使用途中遇见的任何问题，请在任意交流群中反馈问题，我们会尽快修复。
            </p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger>我应该去哪注册账号</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-4 text-balance">
            <p>
              这是ChmlFrp的官方启动器，如果您没有账户，您应该前往我们的官网{" "}
              <a
                href="https://www.chmlfrp.net"
                target="_blank"
                className="text-foreground hover:underline"
              >
                https://www.chmlfrp.net
              </a>{" "}
              进行注册。
            </p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-3">
          <AccordionTrigger>关于映射延迟问题</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-4 text-balance">
            <p>
              节点请尽量选择距离运行映射设备最近的节点。同时，您可以根据节点状态页中的节点负载选择负载较低的节点，这能够优化您的体验。
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

