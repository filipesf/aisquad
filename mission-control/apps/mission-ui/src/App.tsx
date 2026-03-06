import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModeToggle } from '@/components/ModeToggle';
import { Crosshair } from 'lucide-react';
import { Dashboard } from './pages/Dashboard';
import { Telemetry } from './pages/Telemetry';

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      <TooltipProvider>
        <div className="min-h-screen bg-background text-foreground">
          <Tabs defaultValue="dashboard" className="flex flex-col min-h-screen">
            {/* Top bar */}
            <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex h-14 items-center gap-4 px-6">
                <div className="flex items-center gap-2">
                  <Crosshair className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold tracking-tight">Mission Control</span>
                </div>
                <TabsList className="h-8">
                  <TabsTrigger value="dashboard" className="text-xs">Dashboard</TabsTrigger>
                  <TabsTrigger value="telemetry" className="text-xs">Telemetry</TabsTrigger>
                </TabsList>
                <div className="ml-auto">
                  <ModeToggle />
                </div>
              </div>
            </header>

            {/* Page content */}
            <TabsContent value="dashboard" className="flex-1 mt-0">
              <Dashboard />
            </TabsContent>
            <TabsContent value="telemetry" className="flex-1 mt-0">
              <Telemetry />
            </TabsContent>
          </Tabs>
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}
