import { lazy, Suspense } from 'react';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModeToggle } from '@/components/ModeToggle';
import { Crosshair } from 'lucide-react';
import { Dashboard } from './pages/Dashboard';

// Telemetry is not needed on initial load — split it into its own chunk.
// It only loads when the user clicks the Telemetry tab.
const Telemetry = lazy(() => import('./pages/Telemetry').then((m) => ({ default: m.Telemetry })));

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      <TooltipProvider>
        <div className="min-h-screen bg-background text-foreground">
          {/* Skip link for keyboard navigation - WCAG 2.4.1 */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Skip to main content
          </a>

          <Tabs defaultValue="dashboard" className="flex flex-col min-h-screen">
            {/* Top bar */}
            <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex h-14 items-center gap-4 px-6">
                <div className="flex items-center gap-2">
                  <Crosshair className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <h1 className="text-sm font-semibold tracking-tight">Mission Control</h1>
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

            {/* Page content */}
            <main id="main-content">
              <TabsContent value="dashboard" className="flex-1 mt-0">
                <Dashboard />
              </TabsContent>
              <TabsContent value="telemetry" className="flex-1 mt-0">
                <Suspense
                  fallback={
                    <div className="p-6 text-sm text-muted-foreground">Loading Telemetry…</div>
                  }
                >
                  <Telemetry />
                </Suspense>
              </TabsContent>
            </main>
          </Tabs>
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}
