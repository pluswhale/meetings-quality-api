import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { Project, ProjectSchema } from './schemas/project.schema';
import { Meeting, MeetingSchema } from '../meetings/schemas/meeting.schema';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      // Meeting and Task models are needed for cascade delete and count queries.
      { name: Meeting.name, schema: MeetingSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  // Export ProjectsService so MeetingsModule and TasksModule can inject
  // it for project-membership access control checks.
  exports: [ProjectsService],
})
export class ProjectsModule {}
