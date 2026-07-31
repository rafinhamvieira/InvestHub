import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { NotificationsDropdown } from "@/components/layout/notifications-dropdown";
import { SyncButton } from "@/components/layout/sync-button";

interface TopbarProps {
  user: { name: string | null; email: string; image: string | null };
}

export function Topbar({ user }: TopbarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-background/80 px-6 backdrop-blur">
      <div />
      <div className="flex items-center gap-2">
        <SyncButton />
        <NotificationsDropdown />
        <ThemeToggle />
        <UserMenu name={user.name} email={user.email} image={user.image} />
      </div>
    </header>
  );
}
