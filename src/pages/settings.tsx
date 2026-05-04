import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { GlobalShortcutSection } from "@/components/global-shortcut-section";
import type { MobileSyncStatus } from "@/lib/mobile-sync";
import type { NativeFirebaseDeviceCodeSession } from "@/lib/firebase";
import {
  AUTO_UPDATE_OPTIONS,
  DISPLAY_MODE_OPTIONS,
  RESET_TIMER_DISPLAY_OPTIONS,
  THEME_OPTIONS,
  type AutoUpdateIntervalMinutes,
  type DisplayMode,
  type GlobalShortcut,
  type ResetTimerDisplayMode,
  type ThemeMode,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

interface PluginConfig {
  id: string;
  name: string;
  enabled: boolean;
}

function SortablePluginItem({
  plugin,
  onToggle,
}: {
  plugin: PluginConfig;
  onToggle: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plugin.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onToggle(plugin.id)}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md bg-card cursor-pointer",
        "border border-transparent",
        isDragging && "opacity-50 border-border"
      )}
    >
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span
        className={cn(
          "flex-1 text-sm",
          !plugin.enabled && "text-muted-foreground"
        )}
      >
        {plugin.name}
      </span>

      {/* Wrap to stop Base UI's internal input.click() from bubbling to the row div */}
      <span onClick={(e) => e.stopPropagation()}>
        <Checkbox
          key={`${plugin.id}-${plugin.enabled}`}
          checked={plugin.enabled}
          onCheckedChange={() => onToggle(plugin.id)}
        />
      </span>
    </div>
  );
}

interface SettingsPageProps {
  plugins: PluginConfig[];
  onReorder: (orderedIds: string[]) => void;
  onToggle: (id: string) => void;
  autoUpdateInterval: AutoUpdateIntervalMinutes;
  onAutoUpdateIntervalChange: (value: AutoUpdateIntervalMinutes) => void;
  themeMode: ThemeMode;
  onThemeModeChange: (value: ThemeMode) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (value: DisplayMode) => void;
  resetTimerDisplayMode: ResetTimerDisplayMode;
  onResetTimerDisplayModeChange: (value: ResetTimerDisplayMode) => void;
  globalShortcut: GlobalShortcut;
  onGlobalShortcutChange: (value: GlobalShortcut) => void;
  startOnLogin: boolean;
  onStartOnLoginChange: (value: boolean) => void;
  mobileSyncStatus: MobileSyncStatus | null;
  mobileSyncBusy: boolean;
  mobileSyncError: string | null;
  mobileSyncPendingDeviceCodeAuth: NativeFirebaseDeviceCodeSession | null;
  onMobileSyncGoogleSignIn: () => Promise<void> | void;
  onMobileSyncGithubSignIn: () => Promise<void> | void;
  onMobileSyncSyncNow: () => Promise<void> | void;
  onMobileSyncSignOut: () => Promise<void> | void;
  onMobileSyncSaveDeviceName: (deviceName: string) => Promise<void> | void;
}

export function SettingsPage({
  plugins,
  onReorder,
  onToggle,
  autoUpdateInterval,
  onAutoUpdateIntervalChange,
  themeMode,
  onThemeModeChange,
  displayMode,
  onDisplayModeChange,
  resetTimerDisplayMode,
  onResetTimerDisplayModeChange,
  globalShortcut,
  onGlobalShortcutChange,
  startOnLogin,
  onStartOnLoginChange,
  mobileSyncStatus,
  mobileSyncBusy,
  mobileSyncError,
  mobileSyncPendingDeviceCodeAuth,
  onMobileSyncGoogleSignIn,
  onMobileSyncGithubSignIn,
  onMobileSyncSyncNow,
  onMobileSyncSignOut,
  onMobileSyncSaveDeviceName,
}: SettingsPageProps) {
  const [mobileSyncDeviceNameDraft, setMobileSyncDeviceNameDraft] = useState(
    mobileSyncStatus?.deviceName ?? ""
  );
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = plugins.findIndex((item) => item.id === active.id);
      const newIndex = plugins.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(plugins, oldIndex, newIndex);
      onReorder(next.map((item) => item.id));
    }
  };

  useEffect(() => {
    setMobileSyncDeviceNameDraft(mobileSyncStatus?.deviceName ?? "");
  }, [mobileSyncStatus?.deviceName]);

  const deviceNameSaveDisabled = useMemo(() => {
    if (!mobileSyncStatus?.isAuthenticated) return true;
    return (
      mobileSyncBusy ||
      mobileSyncDeviceNameDraft.trim().length === 0 ||
      mobileSyncDeviceNameDraft.trim() === mobileSyncStatus.deviceName
    );
  }, [mobileSyncBusy, mobileSyncDeviceNameDraft, mobileSyncStatus]);

  return (
    <div className="py-3 space-y-4">
      <section>
        <h3 className="text-lg font-semibold mb-0">Auto Refresh</h3>
        <p className="text-sm text-muted-foreground mb-2">
          How obsessive are you
        </p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Auto-update interval">
            {AUTO_UPDATE_OPTIONS.map((option) => {
              const isActive = option.value === autoUpdateInterval;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onAutoUpdateIntervalChange(option.value)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Usage Mode</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Glass half full or half empty
        </p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Usage display mode">
            {DISPLAY_MODE_OPTIONS.map((option) => {
              const isActive = option.value === displayMode;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onDisplayModeChange(option.value)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Reset Timers</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Countdown or clock time
        </p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Reset timer display mode">
            {RESET_TIMER_DISPLAY_OPTIONS.map((option) => {
              const isActive = option.value === resetTimerDisplayMode;
              const absoluteTimeExample = new Intl.DateTimeFormat(undefined, {
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(2026, 1, 2, 11, 4));
              const example = option.value === "relative" ? "5h 12m" : `today at ${absoluteTimeExample}`;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1 flex flex-col items-center gap-0 py-2 h-auto"
                  onClick={() => onResetTimerDisplayModeChange(option.value)}
                >
                  <span>{option.label}</span>
                  <span
                    className={cn(
                      "text-xs font-normal",
                      isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}
                  >
                    {example}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-0">App Theme</h3>
        <p className="text-sm text-muted-foreground mb-2">
          How it looks around here
        </p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Theme mode">
            {THEME_OPTIONS.map((option) => {
              const isActive = option.value === themeMode;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onThemeModeChange(option.value)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <GlobalShortcutSection
        globalShortcut={globalShortcut}
        onGlobalShortcutChange={onGlobalShortcutChange}
      />
      <section>
        <h3 className="text-lg font-semibold mb-0">Start on Login</h3>
        <p className="text-sm text-muted-foreground mb-2">
          AI Usage starts when you sign in
        </p>
        <label className="flex items-center gap-2 text-sm select-none text-foreground">
          <Checkbox
            key={`start-on-login-${startOnLogin}`}
            checked={startOnLogin}
            onCheckedChange={(checked) => onStartOnLoginChange(checked === true)}
          />
          Start on login
        </label>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Mobile Sync</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Sync this Windows device directly to Firebase for the mobile app
        </p>
        <div className="rounded-lg border bg-muted/50 p-3 space-y-3">
          {!mobileSyncStatus?.isConfigured && (
            <div className="space-y-1">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Firebase is not configured on this Windows device.
              </p>
              {mobileSyncStatus?.missingConfigKeys?.length ? (
                <p className="text-xs text-muted-foreground">
                  Missing: {mobileSyncStatus.missingConfigKeys.join(", ")}
                </p>
              ) : null}
            </div>
          )}

          {mobileSyncStatus?.isConfigured &&
          (!mobileSyncStatus.googleSignInAvailable || !mobileSyncStatus.githubSignInAvailable) ? (
            <div className="space-y-1">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Native OAuth provider settings are missing for one or more sign-in providers.
              </p>
              <p className="text-xs text-muted-foreground">
                {!mobileSyncStatus.googleSignInAvailable
                  ? "Google requires VITE_GOOGLE_OAUTH_CLIENT_ID and VITE_GOOGLE_OAUTH_CLIENT_SECRET. "
                  : ""}
                {!mobileSyncStatus.githubSignInAvailable
                  ? "GitHub requires VITE_GITHUB_OAUTH_CLIENT_ID."
                  : ""}
              </p>
            </div>
          ) : null}

          {mobileSyncStatus?.isAuthenticated ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {mobileSyncStatus.account?.displayName ?? mobileSyncStatus.account?.email ?? "Signed in"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Firebase account: {mobileSyncStatus.account?.email ?? mobileSyncStatus.account?.uid}
                </p>
                <p className="text-xs text-muted-foreground">
                  Device ID: {mobileSyncStatus.deviceId ?? "Not assigned yet"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Linked: {mobileSyncStatus.linkedAt
                    ? new Date(mobileSyncStatus.linkedAt).toLocaleString()
                    : "Not linked yet"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last sync: {mobileSyncStatus.lastUploadedAt
                    ? new Date(mobileSyncStatus.lastUploadedAt).toLocaleString()
                    : "Not uploaded yet"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Sync status: {mobileSyncStatus.syncEnabled ? mobileSyncStatus.lastUploadStatus : "disabled"}
                </p>
              </div>
              <div className="space-y-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Device Name</span>
                  <input
                    value={mobileSyncDeviceNameDraft}
                    onChange={(event) => setMobileSyncDeviceNameDraft(event.target.value)}
                    placeholder="Windows PC"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onMobileSyncSaveDeviceName(mobileSyncDeviceNameDraft)}
                  disabled={deviceNameSaveDisabled}
                >
                  {mobileSyncBusy ? "Saving..." : "Save Device Name"}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void onMobileSyncSyncNow()}
                  disabled={mobileSyncBusy || !mobileSyncStatus.syncEnabled}
                >
                  {mobileSyncBusy ? "Syncing..." : "Sync Now"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void onMobileSyncSignOut()}
                  disabled={mobileSyncBusy}
                >
                  Sign Out
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Sign in with the same Firebase account used on Android. Devices under the same
                uid connect automatically.
              </p>
              {mobileSyncPendingDeviceCodeAuth ? (
                <div className="rounded-md border bg-background px-3 py-3 space-y-2">
                  <p className="text-sm font-medium">
                    Finish {mobileSyncPendingDeviceCodeAuth.providerLabel} sign-in in your browser
                  </p>
                  <p className="text-xs text-muted-foreground">
                    If the browser page asks for a code, enter the one below.
                  </p>
                  <div className="rounded-md border border-dashed bg-muted px-3 py-2 text-center text-lg font-semibold tracking-[0.2em]">
                    {mobileSyncPendingDeviceCodeAuth.userCode}
                  </div>
                  <a
                    href={mobileSyncPendingDeviceCodeAuth.verificationUri}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary underline underline-offset-4"
                  >
                    Open verification page
                  </a>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void onMobileSyncGoogleSignIn()}
                  disabled={mobileSyncBusy || !mobileSyncStatus?.googleSignInAvailable}
                >
                  {mobileSyncBusy ? "Signing in..." : "Sign In with Google"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onMobileSyncGithubSignIn()}
                  disabled={mobileSyncBusy || !mobileSyncStatus?.githubSignInAvailable}
                >
                  {mobileSyncBusy ? "Signing in..." : "Sign In with GitHub"}
                </Button>
              </div>
            </div>
          )}

          {(mobileSyncError || mobileSyncStatus?.lastError) && (
            <p className="text-sm text-destructive">
              {mobileSyncError ?? mobileSyncStatus?.lastError}
            </p>
          )}
        </div>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Plugins</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Your AI coding lineup
        </p>
        <div className="bg-muted/50 rounded-lg p-1 space-y-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={plugins.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {plugins.map((plugin) => (
                <SortablePluginItem
                  key={plugin.id}
                  plugin={plugin}
                  onToggle={onToggle}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </section>
    </div>
  );
}
