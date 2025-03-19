import {
  CallToolRequest,
  CallToolResult,
  ListResourcesRequest,
  ReadResourceRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { GaxiosResponse } from "gaxios";
import { tasks_v1 } from "googleapis";

const MAX_TASK_RESULTS = 100;

export class TaskResources {
  static async read(request: ReadResourceRequest, tasks: tasks_v1.Tasks) {
    const taskId = request.params.uri.replace("gtasks:///", "");

    const taskListsResponse: GaxiosResponse<tasks_v1.Schema$TaskLists> =
      await tasks.tasklists.list({
        maxResults: MAX_TASK_RESULTS,
      });

    const taskLists = taskListsResponse.data.items || [];
    let task: tasks_v1.Schema$Task | null = null;

    for (const taskList of taskLists) {
      if (taskList.id) {
        try {
          const taskResponse: GaxiosResponse<tasks_v1.Schema$Task> =
            await tasks.tasks.get({
              tasklist: taskList.id,
              task: taskId,
            });
          task = taskResponse.data;
          break;
        } catch (error) {
          // Task not found in this list, continue to the next one
        }
      }
    }

    if (!task) {
      throw new Error("Task not found");
    }

    return task;
  }

  static async list(
    request: ListResourcesRequest,
    tasks: tasks_v1.Tasks,
  ): Promise<[tasks_v1.Schema$Task[], string | null]> {
    const pageSize = 10;
    const params: any = {
      maxResults: pageSize,
    };

    if (request.params?.cursor) {
      params.pageToken = request.params.cursor;
    }

    const taskListsResponse = await tasks.tasklists.list({
      maxResults: MAX_TASK_RESULTS,
    });

    const taskLists = taskListsResponse.data.items || [];

    let allTasks: tasks_v1.Schema$Task[] = [];
    let nextPageToken = null;

    for (const taskList of taskLists) {
      const tasksResponse = await tasks.tasks.list({
        tasklist: taskList.id,
        ...params,
      });

      const taskItems = tasksResponse.data.items || [];
      allTasks = allTasks.concat(taskItems);

      if (tasksResponse.data.nextPageToken) {
        nextPageToken = tasksResponse.data.nextPageToken;
      }
    }

    return [allTasks, nextPageToken];
  }
}

export class TaskActions {
  private static formatTask(task: tasks_v1.Schema$Task) {
    const taskListId = task.selfLink?.split('/lists/')[1]?.split('/')[0] || 'unknown';
    return `${task.title}\n (Due: ${task.due || "Not set"}) - Notes: ${task.notes} - ID: ${task.id} - Status: ${task.status} - URI: ${task.selfLink} - TaskList: ${taskListId} - Hidden: ${task.hidden} - Parent: ${task.parent} - Deleted?: ${task.deleted} - Completed Date: ${task.completed} - Position: ${task.position} - Updated Date: ${task.updated} - ETag: ${task.etag} - Links: ${task.links} - Kind: ${task.kind}}`;
  }

  private static formatTaskList(taskList: tasks_v1.Schema$Task[]) {
    return taskList.map((task) => this.formatTask(task)).join("\n");
  }

  private static async _list(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListsResponse = await tasks.tasklists.list({
      maxResults: MAX_TASK_RESULTS,
    });

    const taskLists = taskListsResponse.data.items || [];
    let allTasks: tasks_v1.Schema$Task[] = [];

    for (const taskList of taskLists) {
      if (taskList.id) {
        try {
          const tasksResponse = await tasks.tasks.list({
            tasklist: taskList.id,
            maxResults: MAX_TASK_RESULTS,
          });

          const items = tasksResponse.data.items || [];
          allTasks = allTasks.concat(items);
        } catch (error) {
          console.error(`Error fetching tasks for list ${taskList.id}:`, error);
        }
      }
    }
    return allTasks;
  }

  static async create(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";
    const taskTitle = request.params.arguments?.title as string;
    const taskNotes = request.params.arguments?.notes as string;
    const taskStatus = request.params.arguments?.status as string;
    const taskDue = request.params.arguments?.due as string;

    if (!taskTitle) {
      throw new Error("Task title is required");
    }

    const task = {
      title: taskTitle,
      notes: taskNotes,
      due: taskDue,
    };

    const taskResponse = await tasks.tasks.insert({
      tasklist: taskListId,
      requestBody: task,
    });

    return {
      content: [
        {
          type: "text",
          text: `Task created: ${taskResponse.data.title}`,
        },
      ],
      isError: false,
    };
  }

  static async update(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";
    const taskUri = request.params.arguments?.uri as string;
    const taskId = request.params.arguments?.id as string;
    const taskTitle = request.params.arguments?.title as string;
    const taskNotes = request.params.arguments?.notes as string;
    const taskStatus = request.params.arguments?.status as string;
    const taskDue = request.params.arguments?.due as string;

    if (!taskUri) {
      throw new Error("Task URI is required");
    }

    if (!taskId) {
      throw new Error("Task ID is required");
    }

    const task = {
      id: taskId,
      title: taskTitle,
      notes: taskNotes,
      status: taskStatus,
      due: taskDue,
    };

    const taskResponse = await tasks.tasks.update({
      tasklist: taskListId,
      task: taskUri,
      requestBody: task,
    });

    return {
      content: [
        {
          type: "text",
          text: `Task updated: ${taskResponse.data.title}`,
        },
      ],
      isError: false,
    };
  }

  static async list(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const allTasks = await this._list(request, tasks);
    const taskList = this.formatTaskList(allTasks);

    return {
      content: [
        {
          type: "text",
          text: `Found ${allTasks.length} tasks:\n${taskList}`,
        },
      ],
      isError: false,
    };
  }

  static async delete(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";
    const taskId = request.params.arguments?.id as string;

    if (!taskId) {
      throw new Error("Task URI is required");
    }

    await tasks.tasks.delete({
      tasklist: taskListId,
      task: taskId,
    });

    return {
      content: [
        {
          type: "text",
          text: `Task ${taskId} deleted`,
        },
      ],
      isError: false,
    };
  }

  static async search(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const userQuery = request.params.arguments?.query as string;

    const allTasks = await this._list(request, tasks);
    const filteredItems = allTasks.filter(
      (task) =>
        task.title?.toLowerCase().includes(userQuery.toLowerCase()) ||
        task.notes?.toLowerCase().includes(userQuery.toLowerCase()),
    );

    const taskList = this.formatTaskList(filteredItems);

    return {
      content: [
        {
          type: "text",
          text: `Found ${allTasks.length} tasks:\n${taskList}`,
        },
      ],
      isError: false,
    };
  }

  static async clear(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";

    await tasks.tasks.clear({
      tasklist: taskListId,
    });

    return {
      content: [
        {
          type: "text",
          text: `Tasks from tasklist ${taskListId} cleared`,
        },
      ],
      isError: false,
    };
  }

  static async listTaskLists(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListsResponse = await tasks.tasklists.list({
      maxResults: MAX_TASK_RESULTS,
    });

    const taskLists = taskListsResponse.data.items || [];
    const formattedLists = taskLists.map(list => 
      `${list.title}\n ID: ${list.id} - Updated: ${list.updated}`
    ).join('\n');

    return {
      content: [
        {
          type: "text",
          text: `Found ${taskLists.length} task lists:\n${formattedLists}`,
        },
      ],
      isError: false,
    };
  }

  static async moveTask(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const sourceTaskListId = request.params.arguments?.sourceTaskListId as string;
    const targetTaskListId = request.params.arguments?.targetTaskListId as string;
    const taskId = request.params.arguments?.taskId as string;

    if (!sourceTaskListId || !targetTaskListId || !taskId) {
      throw new Error("Source task list ID, target task list ID, and task ID are required");
    }

    // 1. Get the task from the source list
    const sourceTask = await tasks.tasks.get({
      tasklist: sourceTaskListId,
      task: taskId,
    });

    // 2. Create the task in the target list
    const newTask = await tasks.tasks.insert({
      tasklist: targetTaskListId,
      requestBody: {
        title: sourceTask.data.title,
        notes: sourceTask.data.notes,
        due: sourceTask.data.due,
        status: sourceTask.data.status,
      },
    });

    // 3. Delete the task from the source list
    await tasks.tasks.delete({
      tasklist: sourceTaskListId,
      task: taskId,
    });

    return {
      content: [
        {
          type: "text",
          text: `Task "${sourceTask.data.title}" moved from list ${sourceTaskListId} to list ${targetTaskListId}`,
        },
      ],
      isError: false,
    };
  }
}
