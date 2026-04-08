import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TaskDocument = Task & Document;

@Schema({ timestamps: true })
export class Task {
  /**
   * The Project this task belongs to.
   * Required on all new tasks; used for project-scoped queries and
   * access control (only project participants may view/modify tasks).
   */
  @Prop({ type: Types.ObjectId, ref: 'Project', required: false, index: true })
  projectId: Types.ObjectId;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  commonQuestion: string;

  @Prop({ default: false })
  approved: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Meeting', required: true })
  meetingId: Types.ObjectId;

  @Prop({ required: true })
  deadline: Date;

  @Prop({ required: true, default: 0 })
  estimateHours: number;

  @Prop({ required: true, min: 0, max: 100 })
  contributionImportance: number;

  @Prop({ default: false })
  isCompleted: boolean;

  /**
   * Phase 0 (Retrospective) fields — populated when the next meeting reviews
   * this task as a previous commitment.
   */
  @Prop({ type: String, enum: ['completed', 'incomplete', 'pending'], default: 'pending' })
  retroStatus: 'completed' | 'incomplete' | 'pending';

  @Prop({ required: false, default: null })
  statusNote: string | null;

  @Prop({ required: false, default: null })
  retroReviewedAt: Date | null;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const TaskSchema = SchemaFactory.createForClass(Task)
  .index({ projectId: 1, authorId: 1 })
  .index({ projectId: 1, meetingId: 1 });
