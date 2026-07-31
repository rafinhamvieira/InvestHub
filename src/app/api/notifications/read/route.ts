import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { notificationRepository } from "@/repositories/notification.repository";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  await notificationRepository.markAllRead(session.user.id);
  return NextResponse.json({ message: "Notificações marcadas como lidas." });
}
