import { Crosshair } from 'lucide-react';
import { ThemeProvider } from 'next-themes';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ModeToggle } from '@/components/ModeToggle';
import { Toaster } from '@/components/ui/Toaster';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dashboard } from './pages/Dashboard';

/** Format a duration in seconds into a human-readable uptime string. */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
}

// Telemetry is not needed on initial load — split it into its own chunk.
// It only loads when the user clicks the Telemetry tab.
const Telemetry = lazy(() => import('./pages/Telemetry').then((m) => ({ default: m.Telemetry })));

export default function App() {
  // Track the active tab so we can key the content and trigger the entrance animation
  const [activeTab, setActiveTab] = useState('dashboard');

  // Uptime counter — tracks how long this session has been running.
  // Displayed in the crosshair tooltip. A small easter egg for curious operators.
  const [uptimeSeconds, setUptimeSeconds] = useState(0);
  useEffect(() => {
    const startTime = Date.now();
    // Print a console easter egg on mount
    // biome-ignore lint/suspicious/noConsole: intentional easter egg
    console.log(
      '%c Mission Control %c online. Fleet standing by.',
      'background:#e83535;color:#fff;font-weight:bold;padding:2px 8px;border-radius:3px',
      'color:#888'
    );
    const ticker = setInterval(() => {
      setUptimeSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <div className="min-h-screen bg-background text-foreground">
          {/* Skip link for keyboard navigation - WCAG 2.4.1 */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded focus:bg-primary focus:px-4 focus:py-2 focus:font-medium focus:text-primary-foreground focus:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Skip to main content
          </a>

          <Tabs
            defaultValue="dashboard"
            onValueChange={setActiveTab}
            className="flex min-h-screen flex-col"
          >
            {/* Top bar */}
            <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex h-14 items-center gap-4 px-6">
                <div className="flex items-center gap-2">
                  {/* Crosshair: single rotation on mount. Tooltip reveals session uptime
                      as a quiet easter egg for operators who hover the logo. */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`Mission Control — uptime ${formatUptime(uptimeSeconds)}`}
                      >
                        <Crosshair
                          className="h-4 w-4 animate-crosshair-init text-primary"
                          aria-hidden="true"
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      <span className="text-muted-foreground">Uptime</span>{' '}
                      <span className="font-mono">{formatUptime(uptimeSeconds)}</span>
                    </TooltipContent>
                  </Tooltip>
                  <h1 className="animate-fade-up font-semibold text-sm tracking-tight">
                    Mission Control
                  </h1>
                </div>
                <TabsList className="h-8">
                  <TabsTrigger value="dashboard" className="text-xs">
                    Dashboard
                  </TabsTrigger>
                  <TabsTrigger value="telemetry" className="text-xs">
                    Telemetry
                  </TabsTrigger>
                </TabsList>
                <div className="ml-auto">
                  <ModeToggle />
                </div>
              </div>
            </header>

            {/* Page content
                The `key` on each inner wrapper forces a remount when the tab is
                activated, replaying the animate-tab-in entrance animation.       */}
            <main id="main-content">
              <TabsContent value="dashboard" className="mt-0 flex-1">
                <div
                  key={activeTab === 'dashboard' ? 'dashboard-active' : 'dashboard'}
                  className="animate-tab-in"
                >
                  <Dashboard />
                </div>
              </TabsContent>
              <TabsContent value="telemetry" className="mt-0 flex-1">
                <div
                  key={activeTab === 'telemetry' ? 'telemetry-active' : 'telemetry'}
                  className="animate-tab-in"
                >
                  <Suspense
                    fallback={
                      <div className="p-6 text-muted-foreground text-sm">Loading Telemetry…</div>
                    }
                  >
                    <Telemetry />
                  </Suspense>
                </div>
              </TabsContent>
            </main>
          </Tabs>
        </div>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
