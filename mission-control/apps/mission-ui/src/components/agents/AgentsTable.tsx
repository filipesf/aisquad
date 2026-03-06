import { useState } from 'react';
import type { Agent } from '@/types/domain';
import { StatusBadge } from '@/components/StatusBadge';
import { Users } from 'lucide-react';
import { TimeAgo } from '@/components/TimeAgo';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AgentDetailSheet } from './AgentDetailSheet';

interface AgentsTableProps {
  agents: Agent[];
}

function getInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  // Fallback to '?' if name has no valid characters
  return initials || '?';
}

export function AgentsTable({ agents }: AgentsTableProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-md border py-12 text-center">
        <Users className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">No agents registered</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Seen</TableHead>
              <TableHead>Capabilities</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((agent) => {
              const caps = Object.keys(agent.capabilities);
              return (
                <TableRow
                  key={agent.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => setSelectedAgentId(agent.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedAgentId(agent.id);
                    }
                  }}
                  aria-label={`View details for ${agent.name}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs font-medium">
                          {getInitials(agent.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm truncate max-w-[200px]">
                        {agent.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={agent.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <TimeAgo date={agent.last_seen_at} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {caps.slice(0, 3).map((cap) => (
                        <Badge
                          key={cap}
                          variant="outline"
                          className="font-mono text-xs truncate max-w-[120px]"
                        >
                          {cap}
                        </Badge>
                      ))}
                      {caps.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{caps.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AgentDetailSheet agentId={selectedAgentId} onClose={() => setSelectedAgentId(null)} />
    </>
  );
}
