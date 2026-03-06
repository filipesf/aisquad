import { useState, useCallback, memo } from 'react';
import type { Agent } from '@/types/domain';
import { StatusBadge } from '@/components/StatusBadge';
import { Users } from 'lucide-react';
import { TimeAgo } from '@/components/TimeAgo';
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

/**
 * Memoized — re-renders only when the `agents` array reference changes
 * (i.e., after a successful 5-second poll with new data).
 */
export const AgentsTable = memo(function AgentsTable({ agents }: AgentsTableProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const handleClose = useCallback(() => setSelectedAgentId(null), []);

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-md border py-12 text-center">
        <Users className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">No agents connected yet</p>
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
                <AgentRow key={agent.id} agent={agent} caps={caps} onSelect={setSelectedAgentId} />
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AgentDetailSheet agentId={selectedAgentId} onClose={handleClose} />
    </>
  );
});

interface AgentRowProps {
  agent: Agent;
  caps: string[];
  onSelect: (id: string) => void;
}

/**
 * Each row is memoized independently — only rows whose agent data changed
 * will re-render on the next poll cycle.
 */
const AgentRow = memo(function AgentRow({ agent, caps, onSelect }: AgentRowProps) {
  const handleClick = useCallback(() => onSelect(agent.id), [agent.id, onSelect]);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(agent.id);
      }
    },
    [agent.id, onSelect],
  );

  return (
    <TableRow
      role="button"
      tabIndex={0}
      className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`View details for ${agent.name}`}
    >
      <TableCell>
        <span className="font-medium text-sm truncate max-w-[200px]">{agent.name}</span>
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
            <Badge key={cap} variant="outline" className="font-mono text-xs truncate max-w-[120px]">
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
});
