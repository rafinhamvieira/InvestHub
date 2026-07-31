import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { allocationService } from "@/services/allocation.service";
import { AllocationView } from "@/components/allocation/allocation-view";

export const metadata: Metadata = { title: "Alocação" };

export default async function AllocationPage() {
  const session = await auth();
  const overview = await allocationService.getOverview(session!.user.id);

  return <AllocationView overview={overview} />;
}
