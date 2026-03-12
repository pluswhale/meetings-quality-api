import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProjectDocument = Project & Document;

export enum ProjectStatus {
  CURRENT = 'current',
  ARCHIVED = 'archived',
}

/**
 * Project is the top-level organisational container.
 *
 * It groups Meetings and Tasks under a shared context.
 * Every Meeting and Task must reference a Project via projectId.
 *
 * Access control rule: a user may only see or act on a Project
 * (and its child Meetings/Tasks) if their userId is in participantIds.
 */
@Schema({ timestamps: true })
export class Project {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '' })
  goal: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId: Types.ObjectId;

  /**
   * Includes the creator. Enforced in ProjectsService.create().
   * Used as the primary access-control gate for all child resources.
   */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  participantIds: Types.ObjectId[];

  @Prop({
    type: String,
    enum: Object.values(ProjectStatus),
    default: ProjectStatus.CURRENT,
  })
  status: ProjectStatus;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const ProjectSchema = SchemaFactory.createForClass(Project).index({
  participantIds: 1,
  status: 1,
});
