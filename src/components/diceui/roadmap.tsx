'use client';

import * as Kanban from '@/components/diceui/kanban';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GripVertical } from 'lucide-react';
import * as React from 'react';

interface Task {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  description?: string;
  assignee?: string;
  dueDate?: string;
}

const COLUMN_TITLES: Record<string, string> = {
  backlog: 'Planned',
  inProgress: 'In Progress',
  done: 'Completed',
};

export function Roadmap() {
  const [columns, setColumns] = React.useState<Record<string, Task[]>>({
    backlog: [
      {
        id: '1',
        title: 'Real-time collaboration',
        priority: 'high',
        dueDate: 'Q3 2024',
      },
      {
        id: '2',
        title: 'Advanced AI customization',
        priority: 'high',
        dueDate: 'Q3 2024',
      },
      {
        id: '3',
        title: 'Enterprise team management',
        priority: 'medium',
        dueDate: 'Q4 2024',
      },
    ],
    inProgress: [
      {
        id: '4',
        title: 'AI video generation',
        priority: 'high',
        dueDate: 'Q2 2024',
      },
      {
        id: '5',
        title: '3D model export',
        priority: 'high',
        dueDate: 'Q2 2024',
      },
      {
        id: '6',
        title: 'Mobile app enhancement',
        priority: 'medium',
        dueDate: 'Q2 2024',
      },
    ],
    done: [
      {
        id: '7',
        title: 'AI image generation',
        priority: 'high',
        dueDate: 'Q1 2024',
      },
      {
        id: '8',
        title: 'Batch processing',
        priority: 'high',
        dueDate: 'Q1 2024',
      },
      {
        id: '9',
        title: 'API integration',
        priority: 'medium',
        dueDate: 'Q1 2024',
      },
    ],
  });

  return (
    <Kanban.Root
      value={columns}
      onValueChange={setColumns}
      getItemValue={(item) => item.id}
    >
      <Kanban.Board className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(columns).map(([columnValue, tasks]) => (
          <TaskColumn key={columnValue} value={columnValue} tasks={tasks} />
        ))}
      </Kanban.Board>
      <Kanban.Overlay>
        {({ value, variant }) => {
          if (variant === 'column') {
            const tasks = columns[value] ?? [];

            return <TaskColumn value={value} tasks={tasks} />;
          }

          const task = Object.values(columns)
            .flat()
            .find((task) => task.id === value);

          if (!task) return null;

          return <TaskCard task={task} />;
        }}
      </Kanban.Overlay>
    </Kanban.Root>
  );
}

interface TaskCardProps
  extends Omit<React.ComponentProps<typeof Kanban.Item>, 'value'> {
  task: Task;
}

function TaskCard({ task, ...props }: TaskCardProps) {
  return (
    <Kanban.Item key={task.id} value={task.id} asChild {...props}>
      <div className="rounded-md border bg-card p-3 shadow-xs">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="line-clamp-1 font-medium text-sm">
              {task.title}
            </span>
            <Badge
              variant={
                task.priority === 'high'
                  ? 'destructive'
                  : task.priority === 'medium'
                    ? 'default'
                    : 'secondary'
              }
              className="pointer-events-none h-5 rounded-sm px-1.5 text-[11px] capitalize"
            >
              {task.priority}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            {task.assignee && (
              <div className="flex items-center gap-1">
                <div className="size-2 rounded-full bg-primary/20" />
                <span className="line-clamp-1">{task.assignee}</span>
              </div>
            )}
            {task.dueDate && (
              <time className="text-[10px] tabular-nums">{task.dueDate}</time>
            )}
          </div>
        </div>
      </div>
    </Kanban.Item>
  );
}

interface TaskColumnProps
  extends Omit<React.ComponentProps<typeof Kanban.Column>, 'children'> {
  tasks: Task[];
}

function TaskColumn({ value, tasks, ...props }: TaskColumnProps) {
  return (
    <Kanban.Column value={value} {...props}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{COLUMN_TITLES[value]}</span>
          <Badge variant="secondary" className="pointer-events-none rounded-sm">
            {tasks.length}
          </Badge>
        </div>
        <Kanban.ColumnHandle asChild>
          <Button variant="ghost" size="icon">
            <GripVertical className="h-4 w-4" />
          </Button>
        </Kanban.ColumnHandle>
      </div>
      <div className="flex flex-col gap-2 p-0.5">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} asHandle />
        ))}
      </div>
    </Kanban.Column>
  );
}
