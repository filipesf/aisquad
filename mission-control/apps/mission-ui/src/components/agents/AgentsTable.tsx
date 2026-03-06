import { useState } from 'react';
import type { Agent } from '@/types/domain';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeAgo } from '@/components/TimeAgo';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function AgentsTable({ agents }: AgentsTableProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  if (agents.length === 0) {
    return <p className="text-sm text-muted-foreground">No agents registered.</p>;
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
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((agent) => {
              const caps = Object.keys(agent.capabilities);
              return (
                <TableRow key={agent.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs font-medium">
                          {getInitials(agent.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">{agent.name}</span>
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
                        <Badge key={cap} variant="outline" className="font-mono text-xs">
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
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedAgentId(agent.id)}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AgentDetailSheet
        agentId={selectedAgentId}
        onClose={() => setSelectedAgentId(null)}
      />
    </>
  );
}
