import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { TaskWithAssignment, Assignment, Comment as CommentType, Agent } from '../types/domain.ts';
import { getTask, getTaskAssignments, listComments, createComment, listAgents } from '../lib/api.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { TimeAgo } from '../components/TimeAgo.tsx';

function AssignmentHistoryItem({ assignment }: { assignment: Assignment }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-gray-800 bg-gray-900 px-3 py-2">
      <div className="flex items-center gap-3">
        <StatusBadge status={assignment.status} />
        <Link
          to={`/agents/${assignment.agent_id}`}
          className="text-sm text-blue-400 hover:underline"
        >
          {assignment.agent_id.slice(0, 8)}...
        </Link>
      </div>
      <TimeAgo date={assignment.created_at} className="text-xs text-gray-500" />
    </div>
  );
}

function CommentItem({
  comment,
  agents,
}: {
  comment: CommentType;
  agents: Map<string, Agent>;
}) {
  const author = agents.get(comment.author_id);

  return (
    <div className="rounded-md border border-gray-800 bg-gray-900 px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-200">
          {author?.name ?? comment.author_id.slice(0, 8)}
        </span>
        <TimeAgo date={comment.created_at} className="text-xs text-gray-500" />
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-300">{comment.body}</p>
    </div>
  );
}

function MentionAutocomplete({
  agents,
  filter,
  onSelect,
  visible,
}: {
  agents: Agent[];
  filter: string;
  onSelect: (name: string) => void;
  visible: boolean;
}) {
  if (!visible) return null;

  const filtered = agents.filter((a) =>
    a.name.toLowerCase().includes(filter.toLowerCase()),
  );

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 z-10 mb-1 max-h-40 w-48 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 shadow-xl">
      {filtered.map((agent) => (
        <button
          key={agent.id}
          type="button"
          onClick={() => onSelect(agent.name)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-700"
        >
          <div
            className={`h-2 w-2 rounded-full ${agent.status === 'online' ? 'bg-emerald-400' : 'bg-gray-500'}`}
          />
          {agent.name}
        </button>
      ))}
    </div>
  );
}

function CommentComposer({
  taskId,
  agents,
  onPosted,
}: {
  taskId: string;
  agents: Agent[];
  onPosted: () => void;
}) {
  const [body, setBody] = useState('');
  const [authorId, setAuthorId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (value: string) => {
    setBody(value);

    // Check if we're currently typing a mention
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@([\w-]*)$/);

    if (mentionMatch) {
      setShowMentions(true);
      setMentionFilter(mentionMatch[1] ?? '');
    } else {
      setShowMentions(false);
    }
  };

  const handleMentionSelect = (name: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = body.slice(0, cursorPos);
    const mentionStart = textBeforeCursor.lastIndexOf('@');

    const before = body.slice(0, mentionStart);
    const after = body.slice(cursorPos);
    const newBody = `${before}@${name} ${after}`;

    setBody(newBody);
    setShowMentions(false);

    // Refocus and set cursor after the mention
    setTimeout(() => {
      if (textarea) {
        const newCursorPos = mentionStart + name.length + 2;
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || !authorId) return;

    setSubmitting(true);
    try {
      await createComment(taskId, authorId, body.trim());
      setBody('');
      onPosted();
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-2 rounded-lg border border-gray-800 bg-gray-900 p-3"
    >
      <div className="flex items-center gap-2">
        <label htmlFor="comment-author" className="text-xs text-gray-400">
          Post as:
        </label>
        <select
          id="comment-author"
          value={authorId}
          onChange={(e) => setAuthorId(e.target.value)}
          className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
        >
          <option value="">Select agent...</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Write a comment... Use @name to mention an agent"
          rows={3}
          className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <MentionAutocomplete
          agents={agents}
          filter={mentionFilter}
          onSelect={handleMentionSelect}
          visible={showMentions}
        />
      </div>
      <button
        type="submit"
        disabled={submitting || !body.trim() || !authorId}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
      >
        {submitting ? 'Posting...' : 'Post Comment'}
      </button>
    </form>
  );
}

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<TaskWithAssignment | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [comments, setComments] = useState<CommentType[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const [taskData, assignmentData, commentData, agentData] = await Promise.all([
        getTask(id),
        getTaskAssignments(id),
        listComments(id),
        listAgents(),
      ]);
      setTask(taskData);
      setAssignments(assignmentData);
      setComments(commentData);
      setAgents(agentData);
    } catch (err) {
      console.error('Failed to load task:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadData();
    const interval = setInterval(() => void loadData(), 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) {
    return <div className="p-4 text-gray-500">Loading task...</div>;
  }

  if (!task) {
    return <div className="p-4 text-red-400">Task not found</div>;
  }

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <Link to="/tasks" className="text-sm text-gray-400 hover:text-gray-300">
          &larr; Back to board
        </Link>
        <div className="mt-2 flex items-start justify-between">
          <h2 className="text-xl font-bold text-gray-100">{task.title}</h2>
          <StatusBadge status={task.state} />
        </div>
        {task.description && (
          <p className="mt-2 text-sm text-gray-400">{task.description}</p>
        )}
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div>
          <span className="text-xs text-gray-500">Priority</span>
          <p className="text-sm font-mono text-gray-200">P{task.priority}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500">State</span>
          <p className="mt-0.5">
            <StatusBadge status={task.state} />
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Created</span>
          <p className="text-sm text-gray-200">
            <TimeAgo date={task.created_at} />
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Updated</span>
          <p className="text-sm text-gray-200">
            <TimeAgo date={task.updated_at} />
          </p>
        </div>
        {Object.keys(task.required_capabilities).length > 0 && (
          <div className="col-span-2">
            <span className="text-xs text-gray-500">Required Capabilities</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.keys(task.required_capabilities).map((cap) => (
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

      {/* Current Assignment */}
      {task.current_assignment && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-200">Current Assignment</h3>
          <AssignmentHistoryItem assignment={task.current_assignment} />
        </section>
      )}

      {/* Assignment History */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-200">
          Assignment History ({assignments.length})
        </h3>
        {assignments.length === 0 ? (
          <p className="text-sm text-gray-500">No assignments yet</p>
        ) : (
          <div className="space-y-2">
            {assignments.map((a) => (
              <AssignmentHistoryItem key={a.id} assignment={a} />
            ))}
          </div>
        )}
      </section>

      {/* Comments */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-200">
          Comments ({comments.length})
        </h3>
        <div className="space-y-2">
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} agents={agentMap} />
          ))}
        </div>
        <div className="mt-4">
          <CommentComposer taskId={task.id} agents={agents} onPosted={() => void loadData()} />
        </div>
      </section>
    </div>
  );
}
