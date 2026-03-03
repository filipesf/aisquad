import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Agent, Assignment, Notification } from '../types/domain.ts';
import {
  getAgent,
  getAgentAssignments,
  getAgentNotifications,
  acknowledgeNotification,
} from '../lib/api.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { TimeAgo } from '../components/TimeAgo.tsx';

export function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const [agentData, assignmentData, notificationData] = await Promise.all([
        getAgent(id),
        getAgentAssignments(id),
        getAgentNotifications(id),
      ]);
      setAgent(agentData);
      setAssignments(assignmentData);
      setNotifications(notificationData);
    } catch (err) {
      console.error('Failed to load agent:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadData();
    const interval = setInterval(() => void loadData(), 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleAck = async (notifId: string) => {
    try {
      await acknowledgeNotification(notifId);
      void loadData();
    } catch (err) {
      console.error('Failed to acknowledge notification:', err);
    }
  };

  if (loading) {
    return <div className="p-4 text-gray-500">Loading agent...</div>;
  }

  if (!agent) {
    return <div className="p-4 text-red-400">Agent not found</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <Link to="/" className="text-sm text-gray-400 hover:text-gray-300">
          &larr; Back to dashboard
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-100">{agent.name}</h2>
          <StatusBadge status={agent.status} />
        </div>
      </div>

      {/* Agent Info */}
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div>
          <span className="text-xs text-gray-500">Status</span>
          <p className="mt-0.5">
            <StatusBadge status={agent.status} />
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Last Seen</span>
          <p className="text-sm text-gray-200">
            <TimeAgo date={agent.last_seen_at} />
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Heartbeat Interval</span>
          <p className="text-sm text-gray-200">{agent.heartbeat_interval_ms}ms</p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Session Key</span>
          <p className="truncate text-sm font-mono text-gray-200">{agent.session_key}</p>
        </div>
        {Object.keys(agent.capabilities).length > 0 && (
          <div className="col-span-2">
            <span className="text-xs text-gray-500">Capabilities</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.keys(agent.capabilities).map((cap) => (
                <span
                  key={cap}
                  className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-300"
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Current Assignments */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-200">
          Active Assignments ({assignments.length})
        </h3>
        {assignments.length === 0 ? (
          <p className="text-sm text-gray-500">No active assignments</p>
        ) : (
          <div className="space-y-2">
            {assignments.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border border-gray-800 bg-gray-900 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <StatusBadge status={a.status} />
                  <Link
                    to={`/tasks/${a.task_id}`}
                    className="text-sm text-blue-400 hover:underline"
                  >
                    Task {a.task_id.slice(0, 8)}...
                  </Link>
                </div>
                <TimeAgo date={a.created_at} className="text-xs text-gray-500" />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Notification Inbox */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-200">
          Notifications ({notifications.length})
        </h3>
        {notifications.length === 0 ? (
          <p className="text-sm text-gray-500">No notifications</p>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                className="flex items-center justify-between rounded-md border border-gray-800 bg-gray-900 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <StatusBadge status={n.status} />
                  <span className="text-sm text-gray-300">
                    {n.source_type}: {JSON.stringify(n.payload).slice(0, 80)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <TimeAgo date={n.created_at} className="text-xs text-gray-500" />
                  {n.status === 'queued' && (
                    <button
                      type="button"
                      onClick={() => void handleAck(n.id)}
                      className="rounded-md bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
                    >
                      Ack
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
