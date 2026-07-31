import type { Metadata } from "next";
import { ContributionView } from "@/components/contribution/contribution-view";

export const metadata: Metadata = { title: "Recomendação de Aporte" };

export default function ContributionPage() {
  return <ContributionView />;
}
