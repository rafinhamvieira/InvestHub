import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function ComingSoon({ icon: Icon, title, description }: ComingSoonProps) {
  return (
    <Card className="flex min-h-[60vh] items-center justify-center border-dashed">
      <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
          <Icon className="size-6 text-primary" />
        </div>
        <CardHeader className="gap-1 p-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription className="max-w-sm">{description}</CardDescription>
        </CardHeader>
      </CardContent>
    </Card>
  );
}
