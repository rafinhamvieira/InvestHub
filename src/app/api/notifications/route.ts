import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { notificationRepository } from "@/repositories/notification.repository";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const [notifications, unreadCount] = await Promise.all([
    notificationRepository.listByUser(session.user.id),
    notificationRepository.countUnread(session.user.id),
  ]);

  return NextResponse.json({
    unreadCount,
    notifications: notifications.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}
